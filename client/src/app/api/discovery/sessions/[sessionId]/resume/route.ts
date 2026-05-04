// src/app/api/discovery/sessions/[sessionId]/resume/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/discovery';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';

/**
 * GET /api/discovery/sessions/[sessionId]/resume
 *
 * Returns the full conversation history and current interview state for an
 * interrupted session. Called by the client resumption flow to hydrate the
 * hook before the next turn is sent.
 *
 * Returns: { messages: { role, content }[], questionCount, activeField }
 */
export async function GET(
  req:      NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'session-resume', RATE_LIMITS.API_AUTHENTICATED);

    const { sessionId } = await params;
    const log = logger.child({ route: 'GET /api/discovery/sessions/[id]/resume', userId, sessionId });

    const record = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: {
        status:        true,
        questionCount: true,
        activeField:   true,
        conversationId: true,
        conversation: {
          select: {
            messages: {
              orderBy: { createdAt: 'asc' },
              select:  { role: true, content: true, inputMethod: true },
            },
          },
        },
      },
    });

    if (!record) throw new HttpError(404, 'Session not found');
    if (record.status !== 'ACTIVE') throw new HttpError(409, 'Session not resumable');

    // Ensure InterviewState is warm in Redis so the next turn is fast
    const state = await getSession(sessionId);
    log.debug('Session resume loaded', { sessionId, questionCount: record.questionCount, redisWarm: !!state });

    const messages = record.conversation?.messages ?? [];

    return NextResponse.json({
      messages,
      questionCount: record.questionCount,
      activeField:   record.activeField,
      conversationId: record.conversationId,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
