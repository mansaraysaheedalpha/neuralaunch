'use server';
// src/app/(app)/discovery/stuck/actions.ts
//
// Stuck-pipeline session creation, moved off the GET render so a
// refresh of /discovery/stuck/[id] can no longer mint a duplicate
// session. Invoked from the archetype picker's Stuck row on click.
// Preseed shape (STUCK_FOUNDER · fresh_start · audienceTypeLocked) is
// owned by PR 09 — do not change it here.

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createEmptyContext, createInterviewState, saveSession } from '@/lib/discovery';
import {
  assertVentureLimitNotReached,
  assertFreeDiscoverySessionLimit,
} from '@/lib/lifecycle';
import { rateLimitByUser, RATE_LIMITS } from '@/lib/validation/server-helpers';

/**
 * Create a Stuck-founder discovery session, seed the STUCK_FOUNDER
 * Redis preseed, and redirect to the (read-only) placeholder page.
 * Server action — the only place a stuck session is minted. The bare
 * /discovery/stuck GET no longer creates anything.
 */
export async function startStuckSession(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  const userId = session.user.id;
  await rateLimitByUser(userId, 'stuck-start', RATE_LIMITS.API_AUTHENTICATED);
  await assertFreeDiscoverySessionLimit(userId);
  await assertVentureLimitNotReached(userId);

  const emptyContext = createEmptyContext();

  const { sessionId } = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: { userId, title: 'Stuck-founder diagnostic — pending' },
      select: { id: true },
    });
    const newSession = await tx.discoverySession.create({
      data: {
        userId,
        conversationId: conversation.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        beliefState: JSON.parse(JSON.stringify(emptyContext)),
      },
      select: { id: true },
    });
    return { sessionId: newSession.id };
  });

  // STUCK_FOUNDER preseed — 'fresh_start' is the closest scenario until
  // PR 09 introduces a dedicated 'stuck' value. Audience locked so the
  // placeholder (and PR 09's diagnostic) skip re-classification.
  const interviewState = createInterviewState(sessionId, userId, {
    scenario:           'fresh_start',
    audienceType:       'STUCK_FOUNDER',
    audienceTypeLocked: true,
  });
  await saveSession(sessionId, interviewState);

  logger.child({ action: 'startStuckSession', userId }).debug('Started stuck session', { sessionId });

  // Throws NEXT_REDIRECT — navigates the founder to the owned session.
  redirect(`/discovery/stuck/${sessionId}`);
}
