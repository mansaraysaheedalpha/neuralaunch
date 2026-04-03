// src/app/api/discovery/sessions/[sessionId]/turn/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { inngest } from '@/inngest/client';
import { logger } from '@/lib/logger';
import {
  checkRateLimit, RATE_LIMITS, getRequestIdentifier, getClientIp,
} from '@/lib/rate-limit';
import {
  getSession, saveSession, extractContext, applyUpdate, generateQuestion,
  canSynthesise, teeDiscoveryStream,
} from '@/lib/discovery';

const TurnRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.string().max(8000).default(''),
});

/**
 * POST /api/discovery/sessions/[sessionId]/turn
 *
 * Processes one user message in the discovery interview.
 * Persists user message + AI response to the linked Conversation for sidebar history.
 * Streams the next question, OR triggers synthesis via Inngest if ready.
 */
export async function POST(
  req:     NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = authSession.user.id;

  const clientIp = getClientIp(req.headers);
  const rateLimitResult = await checkRateLimit({
    ...RATE_LIMITS.DISCOVERY_TURN,
    identifier: getRequestIdentifier(userId, clientIp),
  });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } },
    );
  }

  const { sessionId } = await params;
  const log = logger.child({ route: 'POST /api/discovery/sessions/[id]/turn', userId, sessionId });

  const body: unknown = await req.json();
  const parsed = TurnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.format() }, { status: 400 });
  }
  const { message, history } = parsed.data;

  const state = await getSession(sessionId);
  if (!state) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
  }
  if (state.userId !== userId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (state.isComplete) {
    return NextResponse.json({ status: 'synthesizing' }, { status: 200 });
  }

  // Fetch conversationId for message persistence (best-effort — non-blocking)
  const dbSession = await prisma.discoverySession.findUnique({
    where: { id: sessionId },
    select: { conversationId: true },
  });
  const conversationId = dbSession?.conversationId ?? null;

  // Persist user message immediately (fire-and-forget, non-fatal)
  if (conversationId) {
    prisma.message.create({
      data: { conversationId, role: 'user', content: message },
    }).catch(() => { /* non-fatal */ });
  }

  try {
    const activeField = state.activeField ?? 'situation';
    const updates    = await extractContext(message, activeField, history);

    // Extraction miss — answer wasn't understood; re-ask the same question more specifically
    if (Object.keys(updates).length === 0) {
      await saveSession(sessionId, state); // reset TTL without advancing state
      const stream   = generateQuestion(activeField, state.phase as never, state.context, true);
      const readable = teeDiscoveryStream(stream.textStream, conversationId);
      const response = new NextResponse(readable);
      response.headers.set('Content-Type', 'text/plain; charset=utf-8');
      response.headers.set('X-Phase', state.phase);
      response.headers.set('X-Question-Count', String(state.questionCount));
      return response;
    }

    const phaseCrossed = false;
    const nextState    = applyUpdate(state, updates, phaseCrossed);

    await saveSession(sessionId, nextState);
    await prisma.discoverySession.update({
      where: { id: sessionId },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        beliefState:      JSON.parse(JSON.stringify(nextState.context)),
        phase:            nextState.phase,
        questionCount:    nextState.questionCount,
        questionsInPhase: nextState.questionsInPhase,
        activeField:      nextState.activeField ?? null,
      },
      select: { id: true },
    });

    if (canSynthesise(nextState.context) || nextState.isComplete) {
      log.debug('Triggering synthesis');
      await inngest.send({ name: 'discovery/synthesis.requested', data: { sessionId, userId } });
      await prisma.discoverySession.update({
        where:  { id: sessionId },
        data:   { status: 'COMPLETE', completedAt: new Date() },
        select: { id: true },
      });
      return NextResponse.json({ status: 'synthesizing' }, { status: 200 });
    }

    const nextField = nextState.activeField;
    if (!nextField) {
      return NextResponse.json({ status: 'synthesizing' }, { status: 200 });
    }

    const stream   = generateQuestion(nextField, nextState.phase as never, nextState.context);
    const readable = teeDiscoveryStream(stream.textStream, conversationId);

    const response = new NextResponse(readable);
    response.headers.set('Content-Type', 'text/plain; charset=utf-8');
    response.headers.set('X-Phase', nextState.phase);
    response.headers.set('X-Question-Count', String(nextState.questionCount));
    return response;
  } catch (error) {
    log.error('Turn processing failed', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
