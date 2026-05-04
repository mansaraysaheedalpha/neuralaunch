// src/app/api/discovery/sessions/[sessionId]/recommendation/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';

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
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'session-recommendation-poll', RATE_LIMITS.API_READ);

    const { sessionId } = await params;
    const log = logger.child({ route: 'GET /api/discovery/sessions/[id]/recommendation', userId, sessionId });

    // Verify the session belongs to this user (single query, no
    // existence-leak via separate 404 vs 401 responses).
    const session = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: { status: true, synthesisStep: true },
    });

    if (!session) {
      throw new HttpError(404, 'Session not found');
    }

    // sessionId is no longer column-level @unique (the partial unique
    // on primaries lives in raw SQL only). Use findFirst against the
    // primary-row predicate so we never accidentally return an alt.
    const recommendation = await prisma.recommendation.findFirst({
      where:  { sessionId, parentRecommendationId: null },
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
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
