// src/inngest/functions/ideation-stage5-synthesize-function.ts
//
// Durable execution of the Stage 5 (No Idea archetype) synthesis bridge.
// Lives in Inngest so the Opus reasoning pass + Sonnet structured-emit
// pair is not bounded by Vercel's 300s serverless ceiling — same
// motivation as the Tier-1 tool workers.
//
// Pipeline:
//   1. 'loading_inputs' → load committed Stage 1-4 docs + Stage 5
//                          chosen snapshot + lifecycle block
//   2. 'synthesizing'   → run runStage5SynthesisBridge (two-phase,
//                          delegates to runFinalSynthesis)
//   3. 'persisting'     → upsert Recommendation + flip Stage 5
//                          'authoring' → 'output_ready' inside a single
//                          $transaction
//   4. 'succeeded'      → mark IdeationStage5Job done
//
// Idempotency: every step.run is memoised by Inngest, the Recommendation
// upsert is keyed on the (sessionId WHERE parentRecommendationId IS
// NULL) partial unique, and the Stage 5 row flip is a where-filtered
// updateMany. A duplicate event for the same jobId produces the same
// end state.
//
// Failure handling: the worker NEVER flips the Stage 5 row on failure —
// it records the synthesis failure on the row's authoring state via
// persistStage5SynthesisFailure so the canvas can surface "Retry" CTA
// and the founder is not blocked. Inngest's `retries: 1` config retries
// transient errors; persistent failures end at 'failed' on the job row.

import { inngest } from '../client';
import { logger } from '@/lib/logger';
import {
  withInngestQueueSpan,
  withDistributedTrace,
} from '@/lib/observability';
import prisma, { toJsonValue } from '@/lib/prisma';
import type { ResearchLogEntry } from '@/lib/research';
import { runStage5SynthesisBridge } from '@/lib/ideation/stage5-handoff/synthesis-bridge';
import {
  updateStage5JobStage,
  succeedStage5Job,
  failStage5Job,
} from '@/lib/ideation/stage5-handoff/job';
import { persistStage5SynthesisFailure } from '@/lib/ideation/stage-run-store';
import {
  loadStage5SynthesisInputs,
  upsertStage5Recommendation,
} from './ideation-stage5-synthesize-helpers';

export const stage5SynthesizeFunction = inngest.createFunction(
  {
    id:       'ideation-stage5-synthesize',
    name:     'Ideation — Stage 5 Synthesis Bridge',
    // Single Inngest retry on transient infrastructure errors. The
    // engine itself owns model-fallback retries via withModelFallback,
    // so this is purely a guard against Inngest-side hiccups.
    retries:  1,
    // Per-user concurrency cap — bounds simultaneous Opus spend when a
    // founder double-fires synthesis across tabs. The accept-and-queue
    // route's dedup makes this rare, but the cap is defence in depth.
    concurrency: [{ limit: 1, key: 'event.data.userId' }],
    timeouts: { start: '10m' },
    triggers: [{ event: 'ideation/stage5-synthesize.requested' }],
  },
  async ({ event, step, runId, attempt }) => {
    const sentryTrace = (event.data as { sentryTrace?: string }).sentryTrace;
    const baggage     = (event.data as { baggage?: string }).baggage;
    return withDistributedTrace(
      { sentryTrace, baggage },
      () => withInngestQueueSpan(
        {
          functionId: 'ideation-stage5-synthesize',
          eventName:  event.name,
          runId,
          attempt,
        },
        async () => {
    const { jobId, userId, sessionId, stageRunId } = event.data as {
      jobId:      string;
      userId:     string;
      sessionId:  string;
      stageRunId: string;
    };
    const log = logger.child({
      inngestFunction: 'ideationStage5Synthesize',
      jobId, userId, sessionId, stageRunId,
    });

    try {
      // ── 1. Loading inputs ─────────────────────────────────────────
      const inputs = await step.run('loading_inputs', async () => {
        await updateStage5JobStage(jobId, 'loading_inputs');
        return loadStage5SynthesisInputs({ sessionId, userId, stageRunId });
      });

      // ── 2. Synthesizing (Opus reasoning + Sonnet emit) ────────────
      const { recommendation, researchLog } = await step.run('synthesizing', async () => {
        await updateStage5JobStage(jobId, 'synthesizing');
        const accumulator: ResearchLogEntry[] = [];
        const rec = await runStage5SynthesisBridge({
          outcomeDocument:      inputs.outcomeDocument,
          requirementsDocument: inputs.requirementsDocument,
          painInventoryDoc:     inputs.painInventoryDoc,
          opportunitySet:       inputs.opportunitySet,
          chosen:               inputs.chosen,
          reserves:             inputs.reserves,
          lifecycleBlock:       inputs.lifecycleBlock || undefined,
          contextId:            sessionId,
          researchAccumulator:  accumulator,
        });
        return { recommendation: rec, researchLog: accumulator };
      });

      // ── 3. Persisting — Recommendation upsert + single Stage 5 row
      //      flip in one shot. The updateMany is idempotent on retry:
      //      the where filter (status='authoring') becomes a no-op
      //      after the first successful flip, so a second invocation
      //      writes nothing rather than throwing.
      const recommendationId = await step.run('persisting', async () => {
        await updateStage5JobStage(jobId, 'persisting');
        const recId = await upsertStage5Recommendation({
          userId, sessionId,
          recommendation,
          researchLog,
          reserves: inputs.reserves,
        });
        await prisma.ideationStageRun.updateMany({
          where: { id: stageRunId, status: 'authoring', stageNumber: 5 },
          data:  {
            status: 'output_ready',
            output: toJsonValue({
              chosenOpportunity:           inputs.chosen,
              reserveOpportunities:        inputs.reserves,
              synthesizedRecommendationId: recId,
              recommendedActions:          [],
              composedAt:                  new Date().toISOString(),
            }),
          },
        });
        return recId;
      });

      // ── 4. Success — mark the job done ────────────────────────────
      await step.run('succeeded', async () => {
        await succeedStage5Job(jobId, recommendationId);
      });

      log.info('[Stage5Synthesize] Done', {
        recommendationId,
        researchCalls: researchLog.length,
        reserveCount:  inputs.reserves.length,
      });
      return { ok: true, recommendationId, sessionId };
    } catch (err) {
      log.error(
        '[Stage5Synthesize] Failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Wrap failure side effects in step.run so an Inngest retry
      // doesn't re-write the failure marker twice. step.run memoises by
      // its step id — both writes are best-effort, neither throws.
      await step.run('handle-failure', async () => {
        // Stage run stays in 'authoring' — synthesisStatus flips to
        // 'synthesis_failed' so the canvas surfaces the retry CTA.
        await persistStage5SynthesisFailure(stageRunId, errorMessage)
          .catch((e) => log.warn('[Stage5Synthesize] failure-state write failed', {
            error: e instanceof Error ? e.message : String(e),
          }));
        await failStage5Job(jobId, err);
      });

      throw err;
    }
        },
      ),
    );
  },
);
