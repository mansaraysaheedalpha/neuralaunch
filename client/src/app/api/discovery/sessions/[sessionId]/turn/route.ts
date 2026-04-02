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
  canSynthesise, INTERVIEW_PHASES,
} from '@/lib/discovery';

const TurnRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  /** The conversationHistory sent from the client for context extraction accuracy */
  history: z.string().max(8000).default(''),
});

/**
 * POST /api/discovery/sessions/[sessionId]/turn
 *
 * Processes one user message in the discovery interview.
 * - Extracts structured context from the message
 * - Advances the interview state machine
 * - Streams the next question, OR triggers synthesis via Inngest if ready
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
    ...RATE_LIMITS.AI_GENERATION,
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

  // Load state from Redis — 401 if session doesn't belong to this user
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

  try {
    // Step 1: extract context from this message
    const activeField = state.activeField ?? 'situation';
    const updates = await extractContext(message, activeField, history);

    // Step 2: advance state machine
    const phaseCrossed = false; // phase transitions are handled inside applyUpdate → advance
    const nextState    = applyUpdate(state, updates, phaseCrossed);

    // Step 3: persist to Redis + DB
    await saveSession(sessionId, nextState);
    await prisma.discoverySession.update({
      where: { id: sessionId },
      data: {
        beliefState:      JSON.parse(JSON.stringify(nextState.context)),
        phase:            nextState.phase,
        questionCount:    nextState.questionCount,
        questionsInPhase: nextState.questionsInPhase,
        activeField:      nextState.activeField ?? null,
      },
      select: { id: true },
    });

    // Step 4: synthesis or next question
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

    // Stream next question
    const nextField = nextState.activeField;
    if (!nextField) {
      return NextResponse.json({ status: 'synthesizing' }, { status: 200 });
    }

    const stream = generateQuestion(nextField, nextState.phase as never, nextState.context);
    const response = stream.toTextStreamResponse();
    response.headers.set('X-Phase',        nextState.phase);
    response.headers.set('X-Question-Count', String(nextState.questionCount));
    return response;
  } catch (error) {
    log.error('Turn processing failed', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
