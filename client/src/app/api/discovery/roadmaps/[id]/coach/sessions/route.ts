// src/app/api/discovery/roadmaps/[id]/coach/sessions/route.ts
//
// List coach sessions for a roadmap. Same pattern as the composer
// and research list endpoints — powers the "Recent conversations"
// sidebar on the standalone Coach page so a founder's preparation +
// rehearsal + debrief work doesn't disappear the moment they
// navigate to another tool.
//
// Returns only standalone sessions (CoachSession entries on
// roadmap.toolSessions). Task-launched sessions live on
// task.coachSession and are surfaced inside the roadmap viewer.
//
// Lean payload: id + who + goal + channel + dates + a set of
// "stage" flags so the UI can show at a glance whether the
// founder stopped at preparation vs completed the full rehearsal.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { CoachSessionSchema } from '@/lib/roadmap/coach';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

/** Lean list-row shape. Full transcript stays on the single-session endpoint. */
export interface CoachSessionListRow {
  id:              string;
  who:             string;
  objective:       string;
  channel:         string;
  createdAt:       string;
  updatedAt:       string;
  hasPreparation:  boolean;
  rolePlayTurns:   number;
  hasDebrief:      boolean;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'coach-sessions-list', RATE_LIMITS.API_READ);

    const { id: roadmapId } = await params;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const raw: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    const rows: CoachSessionListRow[] = [];
    for (const entry of raw) {
      const parsed = CoachSessionSchema.safeParse(entry);
      if (!parsed.success) continue;
      const session = parsed.data;
      rows.push({
        id:              session.id,
        who:             session.setup.who,
        objective:       session.setup.objective,
        channel:         session.channel,
        createdAt:       session.createdAt,
        updatedAt:       session.updatedAt,
        hasPreparation:  Boolean(session.preparation),
        rolePlayTurns:   session.rolePlayHistory?.length ?? 0,
        hasDebrief:      Boolean(session.debrief),
      });
    }

    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const capped = rows.slice(0, 50);

    return NextResponse.json({ sessions: capped });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
