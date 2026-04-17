// src/app/api/discovery/roadmaps/[id]/packager/sessions/[sessionId]/route.ts
//
// Read-only fetch of a packager session by its sessionId. Used by the
// standalone Composer / Coach / Research pages to pre-populate their
// own first inputs from a Packager handoff (?fromPackager=<sessionId>).
//
// Looks in two places:
//   1. roadmap.toolSessions[] — standalone packager sessions
//   2. roadmap.phases[].tasks[].packagerSession — task-launched sessions

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { StoredPhasesArraySchema } from '@/lib/roadmap/checkin-types';
import { safeParsePackagerSession } from '@/lib/roadmap/service-packager';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'packager-session-read', RATE_LIMITS.API_READ);

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
      const parsed = safeParsePackagerSession(standalone);
      if (parsed) return NextResponse.json({ package: parsed.package, context: parsed.context });
    }

    // 2. Task-launched sessions on roadmap.phases[].tasks[].packagerSession
    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (phasesParsed.success) {
      for (const phase of phasesParsed.data) {
        for (const task of phase.tasks) {
          const ps = task.packagerSession as Record<string, unknown> | undefined;
          if (ps && ps['id'] === sessionId) {
            const parsed = safeParsePackagerSession(ps);
            if (parsed) return NextResponse.json({ package: parsed.package, context: parsed.context });
          }
        }
      }
    }

    throw new HttpError(404, 'Session not found');
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
