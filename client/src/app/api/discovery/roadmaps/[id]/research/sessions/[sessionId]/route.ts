// src/app/api/discovery/roadmaps/[id]/research/sessions/[sessionId]/route.ts
//
// Read-only fetch of a research session by its sessionId. Used by the
// standalone Service Packager page when it receives a Research → Packager
// handoff (?fromResearch=<sessionId>). Returns the report so the Packager
// can pre-populate its first input with the digested findings.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { StoredPhasesArraySchema } from '@/lib/roadmap/checkin-types';
import { safeParseResearchSession } from '@/lib/roadmap/research-tool';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'research-session-read', RATE_LIMITS.API_READ);

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
      const parsed = safeParseResearchSession(standalone);
      if (parsed) return NextResponse.json({ session: parsed });
    }

    // 2. Task-launched sessions on roadmap.phases[].tasks[].researchSession
    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (phasesParsed.success) {
      for (const phase of phasesParsed.data) {
        for (const task of phase.tasks) {
          const rs = task.researchSession as Record<string, unknown> | undefined;
          if (rs && rs['id'] === sessionId) {
            const parsed = safeParseResearchSession(rs);
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
