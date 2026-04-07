// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/status/route.ts
import { NextResponse } from 'next/server';
import { z }            from 'zod';
import { Prisma }       from '@prisma/client';
import prisma, { toJsonValue }           from '@/lib/prisma';
import { logger }       from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  TASK_STATUSES,
  StoredPhasesArraySchema,
  patchTask,
  readTask,
  computeProgressSummary,
  type StoredRoadmapPhase,
  type TaskStatus,
} from '@/lib/roadmap/checkin-types';

export const maxDuration = 30;

const BodySchema = z.object({
  status: z.enum(TASK_STATUSES),
});

/**
 * PATCH /api/discovery/roadmaps/[id]/tasks/[taskId]/status
 *
 * Update a single task's status. The roadmap JSON column is mutated
 * in place; the RoadmapProgress summary is upserted in the same
 * transaction so the analytics row never drifts from the JSON state.
 *
 * Concurrency: pure single-row updates on the same row are not
 * affected by the pushback-style optimistic concurrency lock the
 * Recommendation table uses, because the JSON we're mutating is
 * scoped to one task and conflicting writes would just last-write-
 * wins on different fields. If we ever observe corruption from
 * parallel status changes, add a roadmap.statusVersion column.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'roadmap-task-status', RATE_LIMITS.API_AUTHENTICATED);

    const { id: roadmapId, taskId } = await params;
    const log = logger.child({ route: 'PATCH roadmap-task-status', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid body');
    }
    const newStatus: TaskStatus = parsed.data.status;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:               true,
        phases:           true,
        recommendationId: true,
        // Concern 5 trigger #1 — does this recommendation already
        // have an outcome attestation? If yes the trigger is a
        // no-op (the founder has already given their answer); if
        // no, and this status change pushes us to 100% complete,
        // we surface outcomePromptDue=true.
        recommendation: { select: { outcome: { select: { id: true } } } },
      },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) {
      log.warn('Roadmap phases failed schema parse — refusing the status update');
      throw new HttpError(409, 'Roadmap content is malformed');
    }
    const phases: StoredRoadmapPhase[] = phasesParsed.data;

    const next = patchTask(phases, taskId, t => ({
      ...t,
      status:      newStatus,
      // Lock in the completedAt timestamp on the transition into
      // 'completed'. Re-completing an already-completed task does
      // not bump the timestamp.
      completedAt: newStatus === 'completed'
        ? (t.completedAt ?? new Date().toISOString())
        : t.completedAt,
    }));
    if (!next) throw new HttpError(404, 'Task not found in roadmap');

    const summary = computeProgressSummary(next);

    // Atomic write: roadmap JSON + RoadmapProgress upsert in one tx
    await prisma.$transaction(async (tx) => {
      await tx.roadmap.update({
        where: { id: roadmapId },
        data:  { phases: toJsonValue(next) },
      });
      await tx.roadmapProgress.upsert({
        where:  { roadmapId },
        create: {
          roadmapId,
          totalTasks:     summary.totalTasks,
          completedTasks: summary.completedTasks,
          blockedTasks:   summary.blockedTasks,
          lastActivityAt: new Date(),
        },
        update: {
          totalTasks:     summary.totalTasks,
          completedTasks: summary.completedTasks,
          blockedTasks:   summary.blockedTasks,
          lastActivityAt: new Date(),
          // Clear any pending nudge — the founder just engaged
          nudgePending:   false,
        },
      });
    });

    // Re-read the task we just patched so the response carries its
    // canonical post-update shape (with check-in defaults filled in).
    const updated = readTask(next, taskId);

    // Concern 5 trigger #1 — outcome prompt due?
    // The check is "outcome row exists" not "is this the final task"
    // so a roadmap that's been refined after a previous completion
    // does not re-fire the prompt the founder already saw.
    const outcomePromptDue =
      summary.completedTasks === summary.totalTasks
      && summary.totalTasks > 0
      && !roadmap.recommendation?.outcome;

    log.info('Task status updated', { newStatus, summary, outcomePromptDue });
    return NextResponse.json({
      task:             updated?.task ?? null,
      progress:         summary,
      outcomePromptDue,
      recommendationId: roadmap.recommendationId,
    });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    logger.error(
      'Roadmap status PATCH failed',
      err instanceof Error ? err : new Error(String(err)),
    );
    return httpErrorToResponse(err);
  }
}
