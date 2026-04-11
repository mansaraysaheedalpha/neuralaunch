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
} from '@/lib/continuation';

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
    const brief = await step.run('generate-brief', async () => {
      return await generateContinuationBrief({
        recommendation:    loaded.recommendation,
        context:           loaded.context,
        phases:            loaded.phases,
        parkingLot:        loaded.parkingLot,
        metrics,
        motivationAnchor:  loaded.motivationAnchor,
        diagnosticHistory: loaded.diagnosticHistory,
        roadmapId,
      });
    });

    // Step 4 — Persist the brief and metrics, flip status to BRIEF_READY.
    // updateMany guarded on the current GENERATING_BRIEF status so a
    // racing run cannot overwrite an already-persisted brief.
    const persisted = await step.run('persist-brief', async () => {
      const result = await prisma.roadmap.updateMany({
        where: {
          id:                 roadmapId,
          continuationStatus: CONTINUATION_STATUSES.GENERATING_BRIEF,
        },
        data:  {
          continuationBrief:  toJsonValue(brief),
          executionMetrics:   toJsonValue(metrics),
          continuationStatus: CONTINUATION_STATUSES.BRIEF_READY,
        },
      });
      return { count: result.count };
    });

    if (persisted.count === 0) {
      log.warn('[ContinuationBrief] Brief write skipped — status no longer GENERATING_BRIEF');
      return { skipped: true };
    }

    log.info('[ContinuationBrief] Brief persisted', {
      forks:           brief.forks.length,
      parkingLotItems: brief.parkingLotItems.length,
    });

    return { roadmapId, status: 'complete' };
  },
);
