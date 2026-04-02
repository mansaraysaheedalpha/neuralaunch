// src/app/api/discovery/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  checkRateLimit, RATE_LIMITS, getRequestIdentifier, getClientIp,
} from '@/lib/rate-limit';
import {
  createEmptyContext,
  createInterviewState,
  generateQuestion,
  saveSession,
  INTERVIEW_PHASES,
} from '@/lib/discovery';

/**
 * POST /api/discovery/sessions
 *
 * Creates a new discovery session for the authenticated user.
 * Initialises the belief state in Redis and persists the session record to the DB.
 * Returns the sessionId and streams the opening question.
 */
export async function POST(req: NextRequest) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = authSession.user.id;

  const clientIp  = getClientIp(req.headers);
  const rateLimitResult = await checkRateLimit({
    ...RATE_LIMITS.AI_GENERATION,
    identifier: getRequestIdentifier(userId, clientIp),
  });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) },
      },
    );
  }

  const log = logger.child({ route: 'POST /api/discovery/sessions', userId });

  try {
    const emptyContext = createEmptyContext();

    // Persist session to DB — belief state starts empty
    const dbSession = await prisma.discoverySession.create({
      data: {
        userId,
        beliefState: JSON.parse(JSON.stringify(emptyContext)),
      },
      select: { id: true },
    });

    const sessionId = dbSession.id;
    log.debug('Created discovery session', { sessionId });

    // Seed Redis with the interview state
    const interviewState = createInterviewState(sessionId, userId);
    await saveSession(sessionId, interviewState);

    // Stream the opening question for the 'situation' field
    const stream = generateQuestion(
      'situation',
      INTERVIEW_PHASES.ORIENTATION,
      emptyContext,
    );

    const response = stream.toTextStreamResponse();
    response.headers.set('X-Session-Id', sessionId);
    return response;
  } catch (error) {
    log.error('Failed to create discovery session', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
