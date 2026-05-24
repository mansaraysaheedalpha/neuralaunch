// src/lib/ideation/stage5-handoff/job.ts
//
// CRUD + state-transition helpers for IdeationStage5Job — the durable
// row that backs the Stage 5 synthesis bridge worker. Same best-effort
// shape as src/lib/tool-jobs/helpers.ts: stage updates that fail (rare —
// row deleted concurrently or Postgres unavailable) are logged but never
// thrown, so they cannot bring down the worker whose actual job is the
// LLM call.
//
// The accept-and-queue route (POST /sessions/[id]/stage5/synthesize)
// uses `findOpenStage5Job` for idempotency: if the founder double-clicks
// or refreshes mid-run, the second POST returns the in-flight jobId
// rather than enqueuing a duplicate. The partial unique index on the
// table (added in migration 20260524000000) is the database-layer
// backstop for that contract.
//
// The Zod schemas + stage labels are re-exported here so callers can
// keep imports flat (`from '@/lib/ideation/stage5-handoff'`).

import 'server-only';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Stage enum + status payload
// ---------------------------------------------------------------------------

/** Pipeline stage. Written by the worker before each step.run. */
export const STAGE5_JOB_STAGES = [
  'queued',
  'loading_inputs',
  'synthesizing',
  'persisting',
  'succeeded',
  'failed',
] as const;

export type Stage5JobStage = typeof STAGE5_JOB_STAGES[number];

/** Terminal stages — the polling client stops once it observes either. */
export const STAGE5_TERMINAL_STAGES: readonly Stage5JobStage[] = [
  'succeeded',
  'failed',
] as const;

/**
 * Status payload returned by GET /sessions/[id]/stage5/status. Lean
 * shape — the actual Recommendation is fetched separately via the
 * existing Recommendation review surface once the client observes
 * stage='succeeded' + a recommendationId.
 *
 * Mapped to the brief's contract ({ jobId, status, error?, recommendationId? })
 * by the status endpoint's response builder — this payload is the
 * internal projection.
 */
export const Stage5JobStatusSchema = z.object({
  id:               z.string(),
  sessionId:        z.string(),
  stage:            z.enum(STAGE5_JOB_STAGES),
  errorMessage:     z.string().nullable(),
  recommendationId: z.string().nullable(),
  startedAt:        z.string(),
  updatedAt:        z.string(),
  completedAt:      z.string().nullable(),
});

export type Stage5JobStatus = z.infer<typeof Stage5JobStatusSchema>;

// ---------------------------------------------------------------------------
// Create + dedup
// ---------------------------------------------------------------------------

/**
 * Create a fresh job in 'queued' state. Called by the accept-and-queue
 * route BEFORE firing the Inngest event so the jobId can be returned to
 * the client even if Inngest is briefly slow to acknowledge.
 *
 * The partial unique index on (sessionId) WHERE stage NOT IN
 * ('succeeded', 'failed') ensures a racing duplicate INSERT fails with
 * P2002 rather than producing two competing workers — the route's
 * pre-insert `findOpenStage5Job` check makes that race extremely rare,
 * but the database-layer backstop guarantees correctness.
 */
export async function createStage5Job(input: {
  userId:    string;
  sessionId: string;
}): Promise<{ id: string }> {
  const job = await prisma.ideationStage5Job.create({
    data: {
      userId:    input.userId,
      sessionId: input.sessionId,
      stage:     'queued',
    },
    select: { id: true },
  });
  return job;
}

/**
 * Find an in-flight (non-terminal) job for a session. Returns null when
 * none exists. Used by the accept-and-queue route's idempotency check:
 * a second POST while a job is still running surfaces the existing
 * jobId rather than spawning a duplicate.
 */
export async function findOpenStage5Job(
  sessionId: string,
): Promise<{ id: string } | null> {
  return prisma.ideationStage5Job.findFirst({
    where: {
      sessionId,
      stage: { notIn: STAGE5_TERMINAL_STAGES as unknown as Stage5JobStage[] },
    },
    select: { id: true },
  });
}

// ---------------------------------------------------------------------------
// Stage transitions (best-effort)
// ---------------------------------------------------------------------------

/**
 * Update the stage of an in-flight job. Best-effort — caller should not
 * branch on the result. The Inngest worker calls this before each
 * step.run so the founder's polling client sees the right progress
 * stage in real time.
 */
export async function updateStage5JobStage(
  jobId: string,
  stage: Stage5JobStage,
): Promise<void> {
  try {
    await prisma.ideationStage5Job.update({
      where:  { id: jobId },
      data:   { stage },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[Stage5Job] stage update failed', {
      jobId,
      stage,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Mark a job succeeded. Stamps completedAt + clears errorMessage +
 * records the Recommendation row id so the polling client can navigate
 * straight to the review surface. Called by the worker AFTER the
 * Recommendation upsert and the Stage 5 stage-run status flip have
 * both committed.
 */
export async function succeedStage5Job(
  jobId:            string,
  recommendationId: string,
): Promise<void> {
  try {
    await prisma.ideationStage5Job.update({
      where: { id: jobId },
      data:  {
        stage:            'succeeded',
        recommendationId,
        completedAt:      new Date(),
        errorMessage:     null,
      },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[Stage5Job] success write failed', {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Mark a job failed. Sanitises the error message (first line, capped
 * at 500 chars) so the polling client can surface a clean message
 * without leaking stack traces or secrets. The full Error including
 * stack trace is logged by the worker's catch block via the structured
 * logger — this function only mutates the row.
 */
export async function failStage5Job(jobId: string, error: unknown): Promise<void> {
  const errorMessage = sanitiseErrorMessage(error);
  try {
    await prisma.ideationStage5Job.update({
      where: { id: jobId },
      data:  { stage: 'failed', completedAt: new Date(), errorMessage },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[Stage5Job] failure write failed', {
      jobId,
      originalError: errorMessage,
      writeError:    err instanceof Error ? err.message : String(err),
    });
  }
}

function sanitiseErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const firstLine = err.message.split('\n')[0]?.trim() ?? '';
    return firstLine.length > 0 ? firstLine.slice(0, 500) : 'Unknown error';
  }
  return String(err).slice(0, 500);
}
