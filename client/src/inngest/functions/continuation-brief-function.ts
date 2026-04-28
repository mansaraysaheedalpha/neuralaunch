// src/inngest/functions/continuation-brief-function.ts
import { inngest } from '../client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  CONTINUATION_BRIEF_EVENT,
  CONTINUATION_STATUSES,
  computeExecutionMetrics,
  generateContinuationBrief,
  loadContinuationEvidence,
  loadValidationSignal,
} from '@/lib/continuation';
import {
  appendResearchLog,
  safeParseResearchLog,
  type ResearchLogEntry,
} from '@/lib/research';
import { loadContinuationBriefContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock, renderCycleSummariesBlock, renderCrossVentureBlock } from '@/lib/lifecycle/prompt-renderers';

/**
 * continuationBriefFunction
 *
 * Triggered when the founder hits "What's Next?" on a roadmap that
 * is ready for continuation (Scenarios C/D directly, or Scenarios
 * A/B after the diagnostic agent releases the founder). The worker
 * is durable so the expensive Opus call survives transient failures
 * and can be retried without producing duplicate briefs.
 *
 * Idempotency: every step is bracketed in step.run, the brief
 * persistence step uses an updateMany guarded on the current
 * continuationStatus, and the function exits cleanly if the row
 * is no longer in GENERATING_BRIEF (meaning another run already
 * persisted the brief).
 *
 * Event: discovery/continuation.requested
 * Data:  { roadmapId: string, userId: string }
 */
export const continuationBriefFunction = inngest.createFunction(
  {
    id:       'continuation-brief-generation',
    name:     'Roadmap — Generate Continuation Brief',
    retries:  2,
    timeouts: { start: '10m' },
    triggers: [{ event: CONTINUATION_BRIEF_EVENT }],
    onFailure: async ({ event }) => {
      // Wrapper event shape — original payload is at event.data.event.data
      const original = event.data.event.data as { roadmapId: string; userId: string };
      try {
        // Roll the row back to no continuation status so the founder
        // can retry from the UI. We do not record a "FAILED" sentinel
        // because the brief generator is idempotent — re-firing the
        // event will produce a fresh attempt against the same data.
        await prisma.roadmap.updateMany({
          where: {
            id:                 original.roadmapId,
            continuationStatus: CONTINUATION_STATUSES.GENERATING_BRIEF,
          },
          data:  { continuationStatus: null },
        });
      } catch (err) {
        logger.error(
          '[ContinuationBrief] onFailure cleanup failed',
          err instanceof Error ? err : new Error(String(err)),
          { roadmapId: original.roadmapId },
        );
      }
    },
  },
  async ({ event, step }) => {
    const { roadmapId, userId } = event.data as { roadmapId: string; userId: string };

    const log = logger.child({
      inngestFunction: 'continuationBrief',
      roadmapId,
      userId,
      runId: event.id,
    });

    // Step 1 — Load + parse the entire evidence base via the shared
    // helper. The same helper is used by the Phase 4 routes so the
    // brief function and the routes never disagree on shape.
    const loaded = await step.run('load-evidence', async () => {
      const result = await loadContinuationEvidence({ roadmapId, userId });
      if (!result.ok) {
        log.warn('Evidence load failed — skipping brief generation', { reason: result.reason });
        return null;
      }
      // Idempotency guard: the brief is already persisted by an
      // earlier run that won the race. Exit cleanly without firing Opus.
      if (
        result.evidence.briefAlreadyExists
        && result.evidence.continuationStatus !== CONTINUATION_STATUSES.GENERATING_BRIEF
      ) {
        log.info('Brief already exists — skipping');
        return null;
      }
      return result.evidence;
    });

    if (!loaded) return { skipped: true };

    // Step 2 — Compute execution metrics from the parsed evidence.
    // Note: Inngest serialises step return values to JSON, so Date
    // fields on `loaded` arrive here as ISO strings. Re-hydrate them
    // before handing to the metrics calculator, which expects Date
    // instances.
    const metrics = await step.run('compute-execution-metrics', () => {
      return Promise.resolve(computeExecutionMetrics({
        phases:            loaded.phases,
        statedWeeklyHours: loaded.weeklyHours,
        createdAt:         new Date(loaded.createdAt),
        lastActivityAt:    loaded.progress.lastActivityAt
          ? new Date(loaded.progress.lastActivityAt)
          : null,
      }));
    });

    // Step 3 — Generate the brief via Opus (with Sonnet fallback).
    //
    // The B1 architecture flipped continuation research from a
    // separate pre-step (buildContinuationQueries → runResearchQueries)
    // into an in-loop tool the agent chooses to call. The Opus call
    // now exposes exa_search and tavily_search as two independent
    // tools and decides per query which to use; the per-call
    // accumulator captures every tool invocation for the audit log.
    //
    // The accumulator is captured as part of the step's return value
    // (alongside the brief) so an Inngest replay reads it from the
    // serialised step state rather than re-running the research.
    // Load lifecycle context (FounderProfile + prior Cycle Summaries)
    // so the brief gains venture arc awareness. The ventureId comes
    // from the roadmap row's ventureId field; null for pre-lifecycle
    // roadmaps (the block will be empty and the brief runs as before).
    const lifecycleBlock = await step.run('load-lifecycle-context', async () => {
      const roadmap = await prisma.roadmap.findUnique({
        where:  { id: roadmapId },
        select: { ventureId: true },
      });
      if (!roadmap?.ventureId) return '';
      const ctx = await loadContinuationBriefContext(userId, roadmap.ventureId);
      return [
        renderFounderProfileBlock(ctx.profile),
        renderCycleSummariesBlock(ctx.cycleSummaries),
        renderCrossVentureBlock(ctx.crossVentureSummaries),
      ].filter(b => b.length > 0).join('\n');
    });

    // Load aggregated validation-page signal for this venture so the
    // brief generator can ground its interpretation in real market
    // signal. Returns null when no landing page exists — the generator
    // then runs exactly as before (backward compatible).
    const validationSignal = await step.run('load-validation-signal', async () => {
      const roadmap = await prisma.roadmap.findUnique({
        where:  { id: roadmapId },
        select: { ventureId: true },
      });
      if (!roadmap?.ventureId) return null;
      return await loadValidationSignal(roadmap.ventureId);
    });

    const briefStep = await step.run('generate-brief', async () => {
      const accumulator: ResearchLogEntry[] = [];
      const brief = await generateContinuationBrief({
        recommendation:      loaded.recommendation,
        context:             loaded.context,
        phases:              loaded.phases,
        parkingLot:          loaded.parkingLot,
        metrics,
        motivationAnchor:    loaded.motivationAnchor,
        diagnosticHistory:   loaded.diagnosticHistory,
        researchAccumulator: accumulator,
        roadmapId,
        checkinCoverage:     loaded.checkinCoverage,
        lifecycleBlock:      lifecycleBlock || undefined,
        validationSignal:    validationSignal ?? null,
      });
      return { brief, researchLog: accumulator };
    });
    const brief = briefStep.brief;

    // Step 4 — Persist the brief, metrics, and the research log
    // append inside a single Prisma transaction. The status guard
    // (continuationStatus = GENERATING_BRIEF) protects continuationBrief
    // from concurrent worker runs; the SERIALIZABLE isolation level
    // protects the researchLog column from a check-in or pushback
    // write landing between our read and our write. Without the
    // transaction, a check-in route appending its own research entry
    // between findUnique and updateMany would silently lose its row
    // — same class of bug as the continuation phase 6 fork race.
    const persisted = await step.run('persist-brief', async () => {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.roadmap.findUnique({
          where:  { id: roadmapId },
          select: { researchLog: true },
        });
        const nextResearchLog = briefStep.researchLog.length > 0
          ? appendResearchLog(safeParseResearchLog(current?.researchLog), briefStep.researchLog)
          : null;

        const result = await tx.roadmap.updateMany({
          where: {
            id:                 roadmapId,
            continuationStatus: CONTINUATION_STATUSES.GENERATING_BRIEF,
          },
          data:  {
            continuationBrief:  toJsonValue(brief),
            executionMetrics:   toJsonValue(metrics),
            continuationStatus: CONTINUATION_STATUSES.BRIEF_READY,
            ...(nextResearchLog ? { researchLog: toJsonValue(nextResearchLog) } : {}),
          },
        });
        return { count: result.count };
      }, { isolationLevel: 'Serializable' });
    });

    if (persisted.count === 0) {
      log.warn('[ContinuationBrief] Brief write skipped — status no longer GENERATING_BRIEF');
      return { skipped: true };
    }

    log.info('[ContinuationBrief] Brief persisted', {
      forks:           brief.forks.length,
      parkingLotItems: brief.parkingLotItems.length,
      researchCalls:   briefStep.researchLog.length,
    });

    // Emit the lifecycle transition event. This triggers the Lifecycle
    // Transition Engine (Phase 7) which generates a CycleSummary from
    // this cycle's data and updates the Founder Profile. The event is
    // best-effort — if the roadmap has no ventureId (pre-lifecycle
    // data), the engine will skip gracefully.
    await step.run('emit-cycle-completing', async () => {
      const roadmap = await prisma.roadmap.findUnique({
        where:  { id: roadmapId },
        select: { ventureId: true, recommendation: { select: { cycleId: true } } },
      });
      const cycleId = roadmap?.recommendation?.cycleId;
      const ventureId = roadmap?.ventureId;
      if (!cycleId || !ventureId) {
        log.info('[ContinuationBrief] No cycle/venture link — skipping lifecycle event', { roadmapId });
        return;
      }
      await inngest.send({
        name: 'neuralaunch/cycle.completing',
        data: { cycleId, userId, ventureId },
      });
      log.info('[ContinuationBrief] Emitted neuralaunch/cycle.completing', { cycleId, ventureId });
    });

    return { roadmapId, status: 'complete' };
  },
);
