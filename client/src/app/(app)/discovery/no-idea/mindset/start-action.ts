'use server';

import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { isNoIdeaEnabled } from '@/lib/env';
import {
  HttpError,
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

/**
 * startNoIdeaSession — server action triggered by the Stage 0
 * mindset page's "I'm ready, let's start" CTA.
 *
 * Equivalent to POST /api/discovery/sessions with scenario='no_idea',
 * but lives as a server action so the page can be a pure server
 * component without a client-side fetch. Server actions get CSRF
 * protection from Next.js's action-token validation, so we don't
 * need to call enforceSameOrigin here.
 *
 * Performs every guard the API route enforces:
 *   - requireUserId (NextAuth + Bearer fallback)
 *   - isNoIdeaEnabled (feature flag rejection)
 *   - assertFreeDiscoverySessionLimit (Free tier lifetime cap)
 *   - assertVentureLimitNotReached (paid tier venture cap — a
 *     no_idea session reaches stage 5 → Recommendation → Roadmap →
 *     Venture, so the cap gates at creation, not at stage 5)
 *
 * Creates the DiscoverySession + Conversation + the two initial
 * IdeationStageRun rows (stage=0 already committed, stage=1
 * authoring) in a single transaction. Seeds the Redis InterviewState
 * with scenario='no_idea'. Then redirects the founder to the stage
 * page.
 */
export async function startNoIdeaSession(): Promise<void> {
  const userId = await requireUserId();
  await rateLimitByUser(userId, 'no-idea-start', RATE_LIMITS.API_AUTHENTICATED);
  const log = logger.child({ action: 'startNoIdeaSession', userId });

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

  log.debug('Started no_idea session', { sessionId });

  // redirect() throws — must be after all DB work so a redirect-as-
  // throw cannot prevent the row commits above.
  redirect(`/discovery/no-idea/${sessionId}`);
}
