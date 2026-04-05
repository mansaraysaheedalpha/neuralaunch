// src/app/api/discovery/sessions/[sessionId]/resume/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/discovery';

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
  _req:     NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = authSession.user.id;
  const { sessionId } = await params;

  const log = logger.child({ route: 'GET /api/discovery/sessions/[id]/resume', userId, sessionId });

  try {
    const record = await prisma.discoverySession.findUnique({
      where:  { id: sessionId },
      select: {
        userId:        true,
        status:        true,
        questionCount: true,
        activeField:   true,
        conversationId: true,
        conversation: {
          select: {
            messages: {
              orderBy: { createdAt: 'asc' },
              select:  { role: true, content: true },
            },
          },
        },
      },
    });

    if (!record) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (record.userId !== userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (record.status !== 'ACTIVE') return NextResponse.json({ error: 'Session not resumable' }, { status: 409 });

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
  } catch (error) {
    log.error('Resume failed', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
