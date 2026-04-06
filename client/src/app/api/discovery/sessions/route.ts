// src/app/api/discovery/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  checkRateLimit, RATE_LIMITS, getRequestIdentifier, getClientIp,
} from '@/lib/rate-limit';
import { z } from 'zod';
import {
  createEmptyContext,
  createInterviewState,
  saveSession,
} from '@/lib/discovery';

const CreateSessionSchema = z.object({
  // Matches the per-turn cap in /sessions/[sessionId]/turn/route.ts so a
  // founder's long opening message does not silently fail session creation.
  firstMessage: z.string().max(4000).optional(),
});

/**
 * POST /api/discovery/sessions
 *
 * Creates a new discovery session for the authenticated user.
 * Also creates a linked Conversation so messages appear in the sidebar.
 * Does NOT stream an opening question — the interview begins when the
 * user sends their first message to the turn endpoint.
 */
export async function POST(req: NextRequest) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = authSession.user.id;

  const clientIp = getClientIp(req.headers);
  const rateLimitResult = await checkRateLimit({
    ...RATE_LIMITS.AI_GENERATION,
    identifier: getRequestIdentifier(userId, clientIp),
  });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } },
    );
  }

  const log = logger.child({ route: 'POST /api/discovery/sessions', userId });

  const body: unknown = req.headers.get('content-type')?.includes('application/json')
    ? await req.json().catch(() => ({}))
    : {};
  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) {
    log.warn('Invalid create-session body', { issues: parsed.error.issues });
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }
  const { firstMessage } = parsed.data;
  const title = firstMessage?.trim().slice(0, 80) || 'Discovery Interview';

  try {
    const emptyContext = createEmptyContext();

    // Create Conversation + DiscoverySession atomically
    const { sessionId, conversationId } = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: { userId, title },
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

      return { sessionId: session.id, conversationId: conversation.id };
    });

    log.debug('Created discovery session', { sessionId, conversationId });

    // Seed Redis with the interview state
    const interviewState = createInterviewState(sessionId, userId);
    await saveSession(sessionId, interviewState);

    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.headers.set('X-Session-Id', sessionId);
    response.headers.set('X-Conversation-Id', conversationId);
    return response;
  } catch (error) {
    log.error('Failed to create discovery session', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
