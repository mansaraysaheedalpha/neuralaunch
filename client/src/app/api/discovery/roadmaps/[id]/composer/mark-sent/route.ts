// src/app/api/discovery/roadmaps/[id]/composer/mark-sent/route.ts
//
// Standalone Outreach Composer — mark a message as sent.
// Pure data write. No LLM call. Reads the session from roadmap.toolSessions
// by sessionId and appends to sentMessages with an ISO timestamp.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParseComposerSession } from '@/lib/roadmap/composer';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export const maxDuration = 10;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  messageId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/composer/mark-sent
 *
 * Marks a generated message as sent in a standalone composer session.
 * Idempotent on duplicate messageId — a second call updates the sentAt
 * timestamp. Requires sessionId.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'composer-standalone-mark-sent', RATE_LIMITS.API_AUTHENTICATED);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST composer-standalone-mark-sent', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    const rawSession = rawSessions.find(s => s['id'] === parsed.data.sessionId);
    if (!rawSession) throw new HttpError(404, 'Session not found');

    const session = safeParseComposerSession(rawSession);
    if (!session?.output) throw new HttpError(409, 'No generated output found. Run generate first.');

    const messageExists = session.output.messages.some(m => m.id === parsed.data.messageId);
    if (!messageExists) throw new HttpError(404, 'Message not found');

    const sentAt = new Date().toISOString();
    const existingSent = session.sentMessages ?? [];
    const filtered = existingSent.filter(s => s.messageId !== parsed.data.messageId);
    const updatedSent = [...filtered, { messageId: parsed.data.messageId, sentAt }];

    const updatedSession = { ...session, sentMessages: updatedSent, updatedAt: sentAt };

    const otherSessions = rawSessions.filter(s => s['id'] !== parsed.data.sessionId);
    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { toolSessions: toJsonValue([...otherSessions, updatedSession]) },
    });

    log.info('[StandaloneComposer] Message marked sent', { sessionId: parsed.data.sessionId, messageId: parsed.data.messageId });
    return NextResponse.json({ ok: true, sentAt });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
