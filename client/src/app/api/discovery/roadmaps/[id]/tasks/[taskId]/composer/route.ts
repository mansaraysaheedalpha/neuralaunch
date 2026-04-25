// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/composer/route.ts
//
// GET the task's composerSession. Used by the task-launched
// ComposerFlow to refetch after the Inngest generate job completes.

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
import { safeParseComposerSession } from '@/lib/roadmap/composer';

export const maxDuration = 30;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'composer-task-get', RATE_LIMITS.API_READ);
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

    const session = safeParseComposerSession(found.task.composerSession);
    return NextResponse.json({ task: { composerSession: session } });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
