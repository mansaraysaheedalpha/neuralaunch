// src/inngest/functions/tools/research-execute-job.ts
//
// Durable execution of the Research Tool's deep-research call. Lives
// in Inngest so the Opus tool loop is no longer bounded by Vercel's
// 300s serverless ceiling — the original failure mode that triggered
// this whole migration (see docs/inngest-tools-migration-plan-2026-04-24.md).
//
// Pipeline:
//   1. mark stage 'context_loaded' → load roadmap + recommendation
//   2. mark stage 'researching'    → run runResearchExecution (Opus +
//                                    tools, 25 steps, two-phase)
//   3. mark stage 'persisting'     → write report into
//                                    roadmap.toolSessions
//   4. mark stage 'complete'       → fire push notification
//
// Errors at any point flip the job to 'failed' with the error
// message surfaced for the progress UI; a "did not finish" push goes
// out so a backgrounded founder isn't left staring at a stalled
// progress bar.

import { inngest } from '../../client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import { type ResearchLogEntry } from '@/lib/research';
import { runResearchExecution } from '@/lib/roadmap/research-tool';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock, renderCrossVentureBlock } from '@/lib/lifecycle/prompt-renderers';
import {
  StoredPhasesArraySchema,
  readTask,
} from '@/lib/roadmap/checkin-types';
import {
  updateToolJobStage,
  completeToolJob,
  failToolJob,
} from '@/lib/tool-jobs/helpers';
import {
  notifyToolJobComplete,
  notifyToolJobFailed,
} from '@/lib/tool-jobs/notifications';
import { persistToolJobResult } from '@/lib/tool-jobs/persistence';

export const researchExecuteJobFunction = inngest.createFunction(
  {
    id:      'tool-research-execute',
    name:    'Tool — Research Execute',
    // Single retry on Inngest's transient infrastructure errors; the
    // engine itself owns model-fallback retries via withModelFallback.
    retries: 1,
    triggers: [{ event: 'tool/research-execute.requested' }],
  },
  async ({ event, step }) => {
    const { jobId, userId, roadmapId, sessionId, taskId, planText, query } =
      event.data as {
        jobId:     string;
        userId:    string;
        roadmapId: string;
        sessionId: string;
        taskId:    string | null;
        planText:  string;
        query:     string;
      };
    const log = logger.child({
      inngestFunction: 'researchExecuteJob',
      jobId,
      userId,
      roadmapId,
      sessionId,
      taskId: taskId ?? null,
    });

    try {
      // -------------------------------------------------------------------
      // Stage 1 — load belief state + recommendation context
      // -------------------------------------------------------------------
      const context = await step.run('context_loaded', async () => {
        await updateToolJobStage(jobId, 'context_loaded');

        const roadmap = await prisma.roadmap.findFirst({
          where:  { id: roadmapId, userId },
          select: {
            id:           true,
            ventureId:    true,
            phases:       true,
            recommendation: {
              select: {
                path:    true,
                summary: true,
                session: { select: { beliefState: true } },
              },
            },
          },
        });
        if (!roadmap) throw new Error('Roadmap not found for jobId');

        const bsRaw = roadmap.recommendation?.session?.beliefState;
        const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;
        const { profile, crossVentureSummaries } = await loadPerTaskAgentContext(userId, {
          currentVentureId: roadmap.ventureId,
        });
        const founderProfileBlock = [
          renderFounderProfileBlock(profile),
          renderCrossVentureBlock(crossVentureSummaries),
        ].filter(b => b.length > 0).join('\n') || undefined;

        // For task-launched runs, pull the task description so it can
        // flow into the research engine prompt as taskContext. The
        // standalone flow leaves this null and the engine omits the
        // task block from the prompt.
        let taskContext: string | null = null;
        if (taskId) {
          const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
          if (phasesParsed.success) {
            const found = readTask(phasesParsed.data, taskId);
            taskContext = found?.task.description ?? null;
          }
        }

        return {
          founderProfileBlock,
          beliefState: {
            geographicMarket:    bs?.geographicMarket?.value ?? null,
            primaryGoal:         bs?.primaryGoal?.value ?? null,
            situation:           bs?.situation?.value ?? null,
          },
          recommendationPath:    roadmap.recommendation?.path ?? null,
          recommendationSummary: roadmap.recommendation?.summary ?? null,
          taskContext,
        };
      });

      // -------------------------------------------------------------------
      // Stage 2 — run the research execution (Opus tool loop + Sonnet
      // structured emission). This is the call that used to time out at
      // 300s on the synchronous serverless route.
      // -------------------------------------------------------------------
      const { report, accumulatorEntries } = await step.run('researching', async () => {
        await updateToolJobStage(jobId, 'researching');

        const accumulator: ResearchLogEntry[] = [];
        const result = await runResearchExecution({
          founderProfileBlock:   context.founderProfileBlock,
          query,
          plan:                  planText,
          beliefState:           context.beliefState,
          recommendationPath:    context.recommendationPath,
          recommendationSummary: context.recommendationSummary,
          taskContext:           context.taskContext,
          roadmapId,
          researchAccumulator:   accumulator,
        });
        // The two-phase split inside runResearchExecution writes its
        // own progress; we mark 'emitting' just so the client sees a
        // distinct stage for the Sonnet-emit phase.
        await updateToolJobStage(jobId, 'emitting');
        return { report: result, accumulatorEntries: accumulator };
      });

      // -------------------------------------------------------------------
      // Stage 3 — persist via the shared helper. Routes both
      // standalone (toolSessions[]) and task-launched (task.researchSession)
      // shapes through one entry point. See lib/tool-jobs/persistence.ts.
      // -------------------------------------------------------------------
      await step.run('persisting', async () => {
        await updateToolJobStage(jobId, 'persisting');

        const updatedAt = new Date().toISOString();
        await persistToolJobResult({
          roadmapId, userId, sessionId, taskId,
          taskField: 'researchSession',
          buildSession: (existing) => ({
            ...(existing ?? {}),
            id:    sessionId,
            tool:  'research',
            query,
            plan:  planText,
            report,
            updatedAt,
          }),
          researchAccumulator: accumulatorEntries,
        });
      });

      // -------------------------------------------------------------------
      // Stage 4 — fire completion push and mark the job done. Push is
      // best-effort; if it fails we still complete the job so the
      // founder can find the result via the in-app UI.
      // -------------------------------------------------------------------
      await step.run('notify-and-complete', async () => {
        await notifyToolJobComplete({
          userId,
          jobId,
          toolType: 'research_execute',
          roadmapId,
          sessionId,
        });
        await completeToolJob(jobId);
      });

      log.info('[ResearchExecuteJob] Done', {
        findings:      report.findings.length,
        researchCalls: accumulatorEntries.length,
      });

      return { ok: true, sessionId };
    } catch (err) {
      log.error(
        '[ResearchExecuteJob] Failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const errorMessage = err instanceof Error ? err.message : String(err);

      await failToolJob(jobId, err);
      // Best-effort failure push so backgrounded founders aren't left
      // staring at a stalled progress bar in another tab.
      await notifyToolJobFailed({
        userId,
        jobId,
        toolType:    'research_execute',
        roadmapId,
        sessionId,
        errorMessage,
      });

      // Re-throw so Inngest records the failure on the run record;
      // the `retries: 1` config will give one more shot at transient
      // failures (e.g. brief Anthropic overload between primary +
      // fallback exhausting).
      throw err;
    }
  },
);
