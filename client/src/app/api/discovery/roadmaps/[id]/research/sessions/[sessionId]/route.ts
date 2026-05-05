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
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await requireTierOrThrow(userId, 'execute');
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
      // Return the strict-parsed session when the schema accepts it,
      // otherwise return the raw session and let the client's
      // permissive-fallback rendering handle shape drift. The prior
      // shape silently fell through to 404 when safeParse returned
      // null — which made the "Reopen full session" affordance
      // appear broken because the route was 404'ing a session that
      // genuinely exists, just with slightly-off shape.
      const parsed = safeParseResearchSession(standalone);
      return NextResponse.json({ session: parsed ?? standalone });
    }

    // 2. Task-launched sessions on roadmap.phases[].tasks[].researchSession
    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (phasesParsed.success) {
      for (const phase of phasesParsed.data) {
        for (const task of phase.tasks) {
          const rs = task.researchSession as Record<string, unknown> | undefined;
          if (rs && rs['id'] === sessionId) {
            // Same defensive return as the standalone branch — id
            // match wins; the client tolerates shape drift via its
            // permissive-fallback rendering.
            const parsed = safeParseResearchSession(rs);
            return NextResponse.json({ session: parsed ?? rs });
          }
        }
      }
    }

    throw new HttpError(404, 'Session not found');
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
