// src/app/api/discovery/roadmaps/[id]/packager/sessions/route.ts
//
// List packager sessions for a roadmap. Same pattern as the research
// / composer / coach list endpoints — powers the "Recent packages"
// sidebar on the standalone Packager page so generated service
// packages don't vanish the moment the founder navigates away.
//
// Returns only standalone sessions (PackagerSession entries on
// roadmap.toolSessions). Task-launched sessions live on
// task.packagerSession and are surfaced inside the roadmap viewer.
//
// Lean payload: id + serviceName + targetClient + dates + tier count
// + adjustment count. Full package body is fetched on demand via
// the single-session GET route when the founder clicks.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParsePackagerSession } from '@/lib/roadmap/service-packager';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

/** Lean list-row shape. Full package stays on the single-session endpoint. */
export interface PackagerSessionListRow {
  id:                string;
  serviceName:       string;
  targetClient:      string;
  createdAt:         string;
  updatedAt:         string;
  tierCount:         number;
  adjustmentRounds:  number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'packager-sessions-list', RATE_LIMITS.API_READ);

    const { id: roadmapId } = await params;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const raw: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    const rows: PackagerSessionListRow[] = [];
    for (const entry of raw) {
      const session = safeParsePackagerSession(entry);
      if (!session) continue;
      rows.push({
        id:               session.id,
        serviceName:      session.package.serviceName,
        targetClient:     session.package.targetClient,
        createdAt:        session.createdAt,
        updatedAt:        session.updatedAt,
        tierCount:        session.package.tiers.length,
        adjustmentRounds: session.adjustments?.length ?? 0,
      });
    }

    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const capped = rows.slice(0, 50);

    return NextResponse.json({ sessions: capped });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
