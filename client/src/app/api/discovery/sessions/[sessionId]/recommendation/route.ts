// src/app/api/discovery/sessions/[sessionId]/recommendation/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/discovery/sessions/[sessionId]/recommendation
 *
 * Returns the persisted Recommendation for the given session.
 * The recommendation is written by the Inngest synthesis function once complete.
 * Returns 202 (Accepted) if synthesis is still in progress.
 */
export async function GET(
  req:     NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = authSession.user.id;

  const { sessionId } = await params;
  const log = logger.child({ route: 'GET /api/discovery/sessions/[id]/recommendation', userId, sessionId });

  try {
    // Verify the session belongs to this user (single query, no
    // existence-leak via separate 404 vs 401 responses).
    const session = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: { status: true, synthesisStep: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const recommendation = await prisma.recommendation.findUnique({
      where:  { sessionId },
      select: {
        id:                     true,
        path:                   true,
        reasoning:              true,
        firstThreeSteps:        true,
        timeToFirstResult:      true,
        risks:                  true,
        assumptions:            true,
        whatWouldMakeThisWrong: true,
        alternativeRejected:    true,
        createdAt:              true,
      },
    });

    if (!recommendation) {
      // Synthesis may still be running — include current step for ThinkingPanel progress
      log.debug('Recommendation not yet available', { sessionStatus: session.status });
      return NextResponse.json({ status: 'pending', synthesisStep: session.synthesisStep ?? null }, { status: 202 });
    }

    return NextResponse.json({ recommendation });
  } catch (error) {
    log.error('Failed to retrieve recommendation', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
