// src/lib/transformation/helpers.ts
//
// CRUD + state-transition helpers for the TransformationReport
// row, mirroring the tool-jobs pattern. Stage updates are
// best-effort — a missed write must never crash the Inngest worker
// whose actual job is the LLM call. The progress UI tolerates a
// missed update; the durable row remains the source of truth.

import 'server-only';
import { Prisma } from '@prisma/client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { TransformationStage } from './constants';
import type { TransformationReport } from './schemas';

/**
 * Update the stage of an in-flight report. Best-effort. The Inngest
 * worker calls this before each step.run boundary so the polling
 * client sees the current pipeline phase in real time.
 */
export async function updateTransformationStage(
  reportId: string,
  stage:    TransformationStage,
): Promise<void> {
  try {
    await prisma.transformationReport.update({
      where:  { id: reportId },
      data:   { stage },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[TransformationReport] stage update failed', {
      reportId,
      stage,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Mark the report complete. Persists the synthesised content,
 * stamps completedAt, and flips stage → 'complete'. The redaction
 * candidates field is left null until Commit 3 ships the detector;
 * the publish flow gracefully handles that case.
 */
export async function completeTransformationReport(
  reportId: string,
  content:  TransformationReport,
): Promise<void> {
  try {
    await prisma.transformationReport.update({
      where: { id: reportId },
      data:  {
        stage:        'complete',
        content:      toJsonValue(content),
        completedAt:  new Date(),
        errorMessage: null,
      },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[TransformationReport] complete write failed', {
      reportId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Mark the report failed. Sanitises the error message to a single
 * line so the viewer can render it cleanly. The full stack lands
 * in structured logs via the worker's outer catch block.
 */
export async function failTransformationReport(
  reportId: string,
  error:    unknown,
): Promise<void> {
  const errorMessage = sanitiseErrorMessage(error);
  try {
    await prisma.transformationReport.update({
      where: { id: reportId },
      data:  {
        stage:        'failed',
        errorMessage,
        completedAt:  new Date(),
      },
      select: { id: true },
    });
  } catch (err) {
    logger.warn('[TransformationReport] failure write failed', {
      reportId,
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

// Re-export Prisma for engines that need to clear JSON fields.
// Avoids consumers having to import Prisma directly when their
// only need is the JsonNull sentinel.
export { Prisma };
