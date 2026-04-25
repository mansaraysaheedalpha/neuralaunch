// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/coach/prepare/route.ts
//
// Task-launched Conversation Coach — Stage 2: Preparation.
//
// Post-Inngest-migration shape (2026-04-24): accept-and-queue. Returns
// 202 with { jobId, sessionId }. The Inngest worker reads the setup
// from task.coachSession, runs runCoachPreparation, and persists the
// preparation back into the same place.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendToolJobEvent } from '@/lib/tool-jobs/queue';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  StoredPhasesArraySchema,
  readTask,
  type StoredRoadmapPhase,
} from '@/lib/roadmap/checkin-types';
import { ConversationSetupSchema } from '@/lib/roadmap/coach/schemas';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs/helpers';

export const maxDuration = 30;

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/prepare
 *
 * Queues task-launched coach preparation. No request body — reads
 * setup from the task's coachSession. Returns 202 with { jobId,
 * sessionId }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'coach');
    await rateLimitByUser(userId, 'coach-prepare', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST coach-prepare', roadmapId, taskId, userId });

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');
    const phases: StoredRoadmapPhase[] = phasesParsed.data;

    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    const session = found.task.coachSession as Record<string, unknown> | undefined;
    if (!session?.setup) {
      throw new HttpError(409, 'Coach setup has not been completed. Run the setup stage first.');
    }
    const setupParsed = ConversationSetupSchema.safeParse(session.setup);
    if (!setupParsed.success) {
      throw new HttpError(409, 'Coach setup data is malformed.');
    }

    // Setup is the only writer of session.id; if it's missing the row
    // is malformed, not "needs a fresh id." Throw rather than mint a
    // new id that would never match what the worker expects to find.
    const sessionId = session['id'] as string | undefined;
    if (!sessionId) throw new HttpError(409, 'Coach session is malformed (missing id). Re-run setup.');

    const job = await createToolJob({
      userId, roadmapId,
      toolType:  'coach_prepare',
      sessionId,
      taskId,
    });

    await sendToolJobEvent(job.id, {
      name: 'tool/coach-prepare.requested',
      data: {
        jobId:     job.id,
        userId,
        roadmapId,
        sessionId,
        taskId,
      },
    });

    log.info('[CoachPrepare] Job queued', { jobId: job.id, taskId, sessionId });
    return NextResponse.json({ jobId: job.id, sessionId }, { status: 202 });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
