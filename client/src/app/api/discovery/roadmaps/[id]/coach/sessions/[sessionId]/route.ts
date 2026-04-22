// src/app/api/discovery/roadmaps/[id]/coach/sessions/[sessionId]/route.ts
//
// Read-only fetch of a coach session by sessionId. Powers the
// standalone /tools/conversation-coach page's refresh-restore flow
// (same pattern as composer/research/packager). Without this, a
// browser refresh on the preparation / roleplay / debrief stages
// wiped every piece of React state even though the server-side
// toolSessions entry was intact.
//
// Looks in two places so the endpoint can serve either session
// flavour transparently:
//   1. roadmap.toolSessions[] — standalone coach sessions
//   2. roadmap.phases[].tasks[].coachSession — task-launched

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { StoredPhasesArraySchema } from '@/lib/roadmap/checkin-types';
import { CoachSessionSchema } from '@/lib/roadmap/coach';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'coach-session-read', RATE_LIMITS.API_READ);

    const { id: roadmapId, sessionId } = await params;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    // 1. Standalone sessions in roadmap.toolSessions
    const standalone = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>).find(s => s['id'] === sessionId)
      : null;
    if (standalone) {
      const parsed = CoachSessionSchema.safeParse(standalone);
      if (parsed.success) return NextResponse.json({ session: parsed.data });
    }

    // 2. Task-launched sessions on roadmap.phases[].tasks[].coachSession
    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (phasesParsed.success) {
      for (const phase of phasesParsed.data) {
        for (const task of phase.tasks) {
          const cs = task.coachSession as Record<string, unknown> | undefined;
          if (cs && cs['id'] === sessionId) {
            const parsed = CoachSessionSchema.safeParse(cs);
            if (parsed.success) return NextResponse.json({ session: parsed.data });
          }
        }
      }
    }

    throw new HttpError(404, 'Session not found');
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
