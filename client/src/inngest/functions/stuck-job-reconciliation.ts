// src/inngest/functions/stuck-job-reconciliation.ts
//
// Reconciliation sweep that flips abandoned long-running jobs into a
// terminal 'failed' state so the founder sees something actionable
// instead of a stalled progress bar.
//
// Closes a residual gap in the durability story for the long-running
// LLM workers:
//
//   - Inngest's normal failure paths (retries: N + onFailure +
//     try/catch with failToolJob inside step.run) handle the common
//     cases: function crashed, Anthropic returned an error, step
//     exceeded its budget. The H10 step.run wrap on failure handlers
//     prevents duplicate failure pushes on retry.
//
//   - This cron handles what those paths cannot:
//       * the failToolJob write itself failed (Postgres hiccup at
//         exactly the wrong moment), so the row is stuck in a non-
//         terminal stage and the client polls until its 6-minute
//         hard-stop with no resolution
//       * the function process died between step boundaries before
//         either a 'complete' or 'failed' write landed
//       * a Roadmap generation function never started (Inngest queue
//         pressure or signing-key rotation) and onFailure was
//         consequently never invoked
//
// Schedule: every 15 minutes. Two independent steps — failure of one
// does not block the other.

import { inngest } from '../client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { failToolJob } from '@/lib/tool-jobs/helpers';
import { notifyToolJobFailed } from '@/lib/tool-jobs/notifications';
import { TERMINAL_STAGES, type ToolJobType } from '@/lib/tool-jobs/schemas';
import {
  withInngestQueueSpan,
  withDistributedTrace,
} from '@/lib/observability';

// Tool jobs are flagged stuck after 20 minutes in a non-terminal stage.
// Worst-case live runs (Opus + 25-step research loop) finish in ~5
// minutes; the 6-minute client poll cap means anything past the
// 20-minute mark is provably abandoned from the founder's perspective.
const TOOL_JOB_STUCK_MS = 20 * 60 * 1000;

// Roadmap generation is flagged stuck after 15 minutes in GENERATING.
// Function declares timeouts.start: '5m' and retries: 2 with onFailure
// rollback; 15 minutes leaves comfortable margin over the natural
// 3 * 5 = 15 minute worst-case if every retry hits the start window.
const ROADMAP_STUCK_MS = 15 * 60 * 1000;

// Cap how many rows we touch per run. A larger backlog drains across
// successive runs; bounding per-run keeps the cron's wall-clock under
// the Vercel function ceiling and prevents a Postgres surge if a wide
// outage stranded thousands of rows.
const PER_RUN_LIMIT = 50;

const STUCK_TOOL_JOB_ERROR_MESSAGE =
  'Job stalled — reconciliation cron flagged this as abandoned. The result was not produced; please retry.';

export const stuckJobReconciliationFunction = inngest.createFunction(
  {
    id:       'stuck-job-reconciliation',
    name:     'Reconcile abandoned long-running jobs',
    retries:  1,
    triggers: [{ cron: '*/15 * * * *' }],
  },
  async ({ event, step, runId, attempt }) => {
    const sentryTrace = (event.data as { sentryTrace?: string } | undefined)?.sentryTrace;
    const baggage     = (event.data as { baggage?: string } | undefined)?.baggage;
    return withDistributedTrace(
      { sentryTrace, baggage },
      () => withInngestQueueSpan(
        { functionId: 'stuck-job-reconciliation', eventName: event.name, runId, attempt },
        async () => {
    // -----------------------------------------------------------------
    // Step 1 — flag stuck ToolJob rows
    // -----------------------------------------------------------------
    // findMany filter: any non-terminal stage older than the threshold.
    // Building the filter from TERMINAL_STAGES rather than hard-coding
    // the in-flight stages so adding a new pipeline stage in
    // tool-jobs/schemas.ts automatically extends coverage.
    const stuckToolJobs = await step.run('find-stuck-tool-jobs', async () => {
      const cutoff = new Date(Date.now() - TOOL_JOB_STUCK_MS);
      const rows = await prisma.toolJob.findMany({
        where: {
          stage:     { notIn: [...TERMINAL_STAGES] },
          updatedAt: { lt: cutoff },
        },
        orderBy: { updatedAt: 'asc' },
        take:    PER_RUN_LIMIT,
        select: {
          id:        true,
          userId:    true,
          roadmapId: true,
          sessionId: true,
          toolType:  true,
          stage:     true,
        },
      });
      return rows;
    });

    if (stuckToolJobs.length > 0) {
      // Per-row to keep the per-step blast radius small and to give
      // Inngest a meaningful retry boundary if one row's failure
      // write transiently fails — successful neighbours stay
      // committed. step.run memoises by id so a function-level retry
      // doesn't fire duplicate pushes for already-handled rows.
      for (const job of stuckToolJobs) {
        await step.run(`flag-tool-job-${job.id}`, async () => {
          await failToolJob(job.id, new Error(STUCK_TOOL_JOB_ERROR_MESSAGE));
          await notifyToolJobFailed({
            userId:       job.userId,
            jobId:        job.id,
            toolType:     job.toolType as ToolJobType,
            roadmapId:    job.roadmapId,
            sessionId:    job.sessionId,
            errorMessage: STUCK_TOOL_JOB_ERROR_MESSAGE,
          });
          logger.warn('[Reconciliation] ToolJob flagged as stuck', {
            jobId:    job.id,
            userId:   job.userId,
            toolType: job.toolType,
            stage:    job.stage,
          });
        });
      }
    }

    // -----------------------------------------------------------------
    // Step 2 — flag stuck Roadmap rows
    // -----------------------------------------------------------------
    // updateMany on the GENERATING + stale predicate. Single SQL UPDATE
    // covers all matching rows atomically; no per-row push because
    // founders receive roadmap-readiness signals via the in-app status
    // poll on /discovery/recommendations rather than a dedicated push.
    const stuckRoadmapsCount = await step.run('flag-stuck-roadmaps', async () => {
      const cutoff = new Date(Date.now() - ROADMAP_STUCK_MS);
      const result = await prisma.roadmap.updateMany({
        where: {
          status:    'GENERATING',
          updatedAt: { lt: cutoff },
        },
        data: { status: 'FAILED' },
      });
      if (result.count > 0) {
        logger.warn('[Reconciliation] Roadmaps flagged as stuck', {
          count: result.count,
        });
      }
      return result.count;
    });

    return {
      toolJobsFlagged: stuckToolJobs.length,
      roadmapsFlagged: stuckRoadmapsCount,
    };
        },
      ),
    );
  },
);
