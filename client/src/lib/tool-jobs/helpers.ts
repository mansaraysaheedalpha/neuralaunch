// src/lib/tool-jobs/helpers.ts
//
// CRUD + state-transition helpers for the ToolJob durable-execution
// system. Each helper is best-effort — stage updates that fail (for
// example because the row was deleted concurrently or Postgres is
// briefly unavailable) are logged but never thrown, so they cannot
// take down the Inngest function whose actual job is to run the
// LLM call. The progress UI tolerates a missed update; an
// abandoned-mid-flight job will never strand a founder.

import 'server-only';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { ToolJobStage, ToolJobType } from './schemas';

/**
 * Create a new ToolJob row in the 'queued' stage. Called by the
 * route handler the moment the founder clicks "go" — before the
 * Inngest event is fired, so the jobId can be returned to the
 * client even if Inngest is briefly slow to acknowledge the event.
 */
export async function createToolJob(input: {
  userId:    string;
  roadmapId: string;
  toolType:  ToolJobType;
  sessionId: string;
  taskId?:   string;
}): Promise<{ id: string }> {
  const job = await prisma.toolJob.create({
    data: {
      userId:    input.userId,
      roadmapId: input.roadmapId,
      toolType:  input.toolType,
      sessionId: input.sessionId,
      taskId:    input.taskId ?? null,
      stage:     'queued',
    },
    select: { id: true },
  });
  return job;
}

/**
 * Update the stage of an in-flight job. Best-effort — caller
 * should not branch on the result. The Inngest function calls this
 * before each step.run so the client polling sees the correct
 * stage in real time.
 */
export async function updateToolJobStage(
  jobId: string,
  stage: ToolJobStage,
): Promise<void> {
  try {
    await prisma.toolJob.update({
      where: { id: jobId },
      data:  { stage },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[ToolJob] stage update failed', {
      jobId,
      stage,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Mark a job complete. Sets stage to 'complete' and stamps
 * completedAt. Called by the Inngest function after the result
 * has been persisted to roadmap.toolSessions and the push
 * notification has been fired (or attempted).
 */
export async function completeToolJob(jobId: string): Promise<void> {
  try {
    await prisma.toolJob.update({
      where: { id: jobId },
      data:  { stage: 'complete', completedAt: new Date(), errorMessage: null },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[ToolJob] complete write failed', {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Mark a job failed. Stores the error message for surfacing in the
 * progress UI. The Inngest function calls this in its catch block
 * before re-throwing so the founder sees what went wrong instead of
 * an indefinite progress bar.
 *
 * The error message is lightly sanitised — we strip any obvious
 * stack trace lines to keep the UI message readable, but the full
 * stack is in the structured log via the caller.
 */
export async function failToolJob(jobId: string, error: unknown): Promise<void> {
  const errorMessage = sanitiseErrorMessage(error);
  try {
    await prisma.toolJob.update({
      where: { id: jobId },
      data:  { stage: 'failed', completedAt: new Date(), errorMessage },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[ToolJob] failure write failed', {
      jobId,
      originalError: errorMessage,
      writeError:    err instanceof Error ? err.message : String(err),
    });
  }
}

function sanitiseErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Take the first line of the message — typically the human-readable
    // summary before the stack trace blob. Cap length so the UI can
    // render it cleanly.
    const firstLine = err.message.split('\n')[0]?.trim() ?? '';
    return firstLine.length > 0 ? firstLine.slice(0, 500) : 'Unknown error';
  }
  return String(err).slice(0, 500);
}
