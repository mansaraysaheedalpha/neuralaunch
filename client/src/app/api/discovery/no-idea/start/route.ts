// src/app/api/discovery/no-idea/start/route.ts
//
// POST /api/discovery/no-idea/start
//
// REST counterpart to the `startNoIdeaSession` server action at
// `client/src/app/(app)/discovery/no-idea/mindset/start-action.ts`.
// The action is invoked from a server component form on the web; the
// mobile app cannot call server actions directly (the action protocol
// is Next-internal and requires action-token validation that only the
// browser receives via the form HTML). This endpoint runs the same
// guards + transaction and returns the new sessionId in JSON so the
// mobile mindset screen can navigate to it client-side.
//
// Keep this route in lock-step with start-action.ts — both must apply
// identical guards, create the same rows, and seed the same Redis
// state. If you change one, update the other.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { isNoIdeaEnabled } from '@/lib/env';
import {
  HttpError,
  httpErrorToResponse,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import {
  createEmptyContext,
  createInterviewState,
  saveSession,
} from '@/lib/discovery';
import {
  assertVentureLimitNotReached,
  assertFreeDiscoverySessionLimit,
} from '@/lib/lifecycle';
import { createInitialStageRunsForNoIdea } from '@/lib/ideation';

export async function POST(request: Request) {
  try {
    // enforceSameOrigin is lenient with non-browser clients (no
    // Sec-Fetch-Site, no Origin header), so mobile native fetch passes
    // through. Browser-originating requests still get CSRF protection.
    enforceSameOrigin(request);
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'no-idea-start', RATE_LIMITS.API_AUTHENTICATED);
    const log = logger.child({ route: 'POST /api/discovery/no-idea/start', userId });

    if (!isNoIdeaEnabled()) {
      throw new HttpError(400, 'no_idea archetype is not enabled in this environment');
    }

    await assertFreeDiscoverySessionLimit(userId);
    await assertVentureLimitNotReached(userId);

    const emptyContext = createEmptyContext();

    const { sessionId } = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: { userId, title: 'Outcome Definition — Stage 1' },
        select: { id: true },
      });

      const session = await tx.discoverySession.create({
        data: {
          userId,
          conversationId: conversation.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          beliefState: JSON.parse(JSON.stringify(emptyContext)),
        },
        select: { id: true },
      });

      await createInitialStageRunsForNoIdea(tx, session.id);

      return { sessionId: session.id };
    });

    const interviewState = createInterviewState(sessionId, userId, {
      scenario: 'no_idea',
    });
    await saveSession(sessionId, interviewState);

    log.debug('Started no_idea session (REST)', { sessionId });

    return NextResponse.json({ sessionId });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
