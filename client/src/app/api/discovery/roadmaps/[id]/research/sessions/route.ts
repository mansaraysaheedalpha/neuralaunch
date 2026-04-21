// src/app/api/discovery/roadmaps/[id]/research/sessions/route.ts
//
// List research sessions for a roadmap. Powers the "Recent research"
// panel on the standalone Research Tool page so completed reports
// don't disappear the moment the founder navigates away.
//
// Returns only standalone sessions (tool === 'research' on
// roadmap.toolSessions). Task-launched research sessions live on
// task.researchSession and are surfaced inside the roadmap viewer
// for the task they belong to — a founder browsing /tools/research
// shouldn't see those mixed in with their freeform research.
//
// Lean payload on the list: id + query + createdAt + updatedAt +
// hasReport + hasFollowUps. Full report text is fetched on demand
// via the single-session GET route when the founder clicks an entry.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParseResearchSession } from '@/lib/roadmap/research-tool';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

/** Lean list-row shape. Full report stays on the single-session endpoint. */
export interface ResearchSessionListRow {
  id:            string;
  query:         string;
  createdAt:     string;
  updatedAt:     string;
  hasReport:     boolean;
  followUpCount: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'research-sessions-list', RATE_LIMITS.API_READ);

    const { id: roadmapId } = await params;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const raw: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    const rows: ResearchSessionListRow[] = [];
    for (const entry of raw) {
      const session = safeParseResearchSession(entry);
      if (!session) continue;
      rows.push({
        id:            session.id,
        query:         session.query,
        createdAt:     session.createdAt,
        updatedAt:     session.updatedAt,
        hasReport:     Boolean(session.report),
        followUpCount: session.followUps?.length ?? 0,
      });
    }

    // Newest first. Cap at 50 — nobody's productively browsing past 50.
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const capped = rows.slice(0, 50);

    return NextResponse.json({ sessions: capped });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
