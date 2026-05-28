// src/app/(app)/discovery/stuck/page.tsx
//
// Picker row II ("I've started something and I'm stuck") routes here.
// This server page creates the discovery session, then redirects to
// /discovery/stuck/[sessionId] where PR 09 will build the bespoke
// diagnostic interview. Until PR 09 ships, that destination is a
// placeholder that bounces the founder to the standard discovery
// pipeline with the STUCK_FOUNDER audience preseed.

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

export default async function StuckLandingPage() {
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

  // Seed Redis InterviewState with the STUCK_FOUNDER preseed so the
  // placeholder page (and PR 09's diagnostic when it lands) can read
  // the audience without re-running classification. The 'fresh_start'
  // scenario is the closest fit until PR 09 introduces a dedicated
  // 'stuck' scenario value — the founder is starting a session with
  // the audience locked in, not continuing a fork.
  const interviewState = createInterviewState(sessionId, userId, {
    scenario:           'fresh_start',
    audienceType:       'STUCK_FOUNDER',
    audienceTypeLocked: true,
  });
  await saveSession(sessionId, interviewState);

  logger.child({ action: 'startStuckSession', userId }).debug('Started stuck session', { sessionId });

  // Throws — redirects out before this fires twice on retries.
  redirect(`/discovery/stuck/${sessionId}`);
}
