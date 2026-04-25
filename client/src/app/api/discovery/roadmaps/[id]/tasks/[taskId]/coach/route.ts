// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/coach/route.ts
//
// GET the task's coachSession. Used by the task-launched CoachFlow to
// refetch after the Inngest prepare job completes.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  StoredPhasesArraySchema,
  readTask,
} from '@/lib/roadmap/checkin-types';

export const maxDuration = 30;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'coach-task-get', RATE_LIMITS.API_READ);
    const { id: roadmapId, taskId } = await params;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');

    const found = readTask(phasesParsed.data, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    return NextResponse.json({
      task: { coachSession: found.task.coachSession ?? null },
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
