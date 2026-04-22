// src/app/api/discovery/roadmaps/[id]/composer/sessions/[sessionId]/route.ts
//
// Read-only fetch of a composer session by sessionId. Used by the
// standalone /tools/outreach-composer page to rehydrate state when
// the founder refreshes the browser or returns via a URL that
// carries ?sessionId=. Without this endpoint, a refresh on the
// output view discards context + channel + generated messages and
// forces the founder to start over — same failure class that the
// Research Tool hit before its session sidebar shipped.
//
// Looks in two places so the same endpoint can serve handoff
// integrations that link to either session flavour:
//   1. roadmap.toolSessions[] — standalone composer sessions
//   2. roadmap.phases[].tasks[].composerSession — task-launched

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { StoredPhasesArraySchema } from '@/lib/roadmap/checkin-types';
import { safeParseComposerSession } from '@/lib/roadmap/composer';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'composer-session-read', RATE_LIMITS.API_READ);

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
      const parsed = safeParseComposerSession(standalone);
      if (parsed) return NextResponse.json({ session: parsed });
    }

    // 2. Task-launched sessions on roadmap.phases[].tasks[].composerSession
    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (phasesParsed.success) {
      for (const phase of phasesParsed.data) {
        for (const task of phase.tasks) {
          const cs = task.composerSession as Record<string, unknown> | undefined;
          if (cs && cs['id'] === sessionId) {
            const parsed = safeParseComposerSession(cs);
            if (parsed) return NextResponse.json({ session: parsed });
          }
        }
      }
    }

    throw new HttpError(404, 'Session not found');
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
