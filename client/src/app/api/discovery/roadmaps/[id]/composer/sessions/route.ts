// src/app/api/discovery/roadmaps/[id]/composer/sessions/route.ts
//
// List composer sessions for a roadmap. Powers the "Recent outreach"
// sidebar on the standalone Composer page so generated messages
// don't vanish the moment the founder navigates away. Before this
// existed, the only way back to prior output was a stale browser
// tab with ?sessionId= still in the URL — any navigation via the
// in-app Tools menu wiped the context.
//
// Returns only standalone sessions (tool === 'outreach_composer'
// entries on roadmap.toolSessions). Task-launched sessions live on
// task.composerSession and are surfaced inside the roadmap viewer.
//
// Lean payload: id + targetDescription + mode + channel + dates +
// hasOutput + messageCount. Full message bodies are fetched on
// demand via the single-session GET route when the founder clicks.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParseComposerSession } from '@/lib/roadmap/composer';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

/** Lean list-row shape. Full messages stay on the single-session endpoint. */
export interface ComposerSessionListRow {
  id:                 string;
  targetDescription:  string;
  mode:               string;
  channel:            string;
  createdAt:          string;
  updatedAt:          string;
  hasOutput:          boolean;
  messageCount:       number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'composer-sessions-list', RATE_LIMITS.API_READ);

    const { id: roadmapId } = await params;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const raw: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    const rows: ComposerSessionListRow[] = [];
    for (const entry of raw) {
      const session = safeParseComposerSession(entry);
      if (!session) continue;
      rows.push({
        id:                session.id,
        targetDescription: session.context.targetDescription,
        mode:              session.mode,
        channel:           session.channel,
        createdAt:         session.createdAt,
        updatedAt:         session.updatedAt,
        hasOutput:         Boolean(session.output),
        messageCount:      session.output?.messages.length ?? 0,
      });
    }

    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const capped = rows.slice(0, 50);

    return NextResponse.json({ sessions: capped });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
