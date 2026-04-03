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
  canSynthesise, teeDiscoveryStream, detectAudienceType, computeOverallCompleteness,
  generateMetaResponse, generateFrustrationResponse, generateClarificationResponse,
} from '@/lib/discovery';

const TurnRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.string().max(8000).default(''),
});

function buildStreamResponse(s: ReadableStream<string>, cid: string|null, p: string, n: number): NextResponse {
  const r = new NextResponse(teeDiscoveryStream(s, cid));
  r.headers.set('Content-Type', 'text/plain; charset=utf-8');
  r.headers.set('X-Phase', p); r.headers.set('X-Question-Count', String(n));
  return r;
}
/** POST — process one discovery turn, stream the next question, or trigger synthesis. */
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
  const conversationId: string | null = dbSession?.conversationId ?? null;

  // Persist user message immediately (fire-and-forget, non-fatal)
  if (conversationId) {
    prisma.message.create({
      data: { conversationId, role: 'user', content: message },
    }).catch(() => { /* non-fatal */ });
  }

  try {
    const rawField    = state.activeField ?? 'situation';
    const activeField = rawField === 'psych_probe' ? 'biggestConcern' : rawField;
    const { updates, inputType, contradicts } = await extractContext(message, activeField, history, state.context[activeField]);
    if (inputType === 'offtopic') { await saveSession(sessionId, state); return buildStreamResponse(generateMetaResponse(message).textStream, conversationId, state.phase, state.questionCount); }
    if (inputType === 'frustrated') { await saveSession(sessionId, state); return buildStreamResponse(generateFrustrationResponse(message, activeField).textStream, conversationId, state.phase, state.questionCount); }
    if (contradicts) { await saveSession(sessionId, state); return buildStreamResponse(generateClarificationResponse(message, activeField, state.context[activeField]).textStream, conversationId, state.phase, state.questionCount); }
    // Genuine extraction miss — re-ask with clarification, or skip after 2 consecutive misses
    if (Object.keys(updates).length === 0) {
      if (state.consecutiveMisses >= 1) {
        const skipped = { ...applyUpdate(state, {}, false), consecutiveMisses: 0 };
        await saveSession(sessionId, skipped);
        if (!skipped.activeField) return NextResponse.json({ status: 'synthesizing' });
        return buildStreamResponse(generateQuestion(skipped.activeField, skipped.phase as never, skipped.context).textStream, conversationId, skipped.phase, skipped.questionCount);
      }
      await saveSession(sessionId, { ...state, consecutiveMisses: 1 });
      return buildStreamResponse(generateQuestion(rawField, state.phase as never, state.context, { unclear: true }).textStream, conversationId, state.phase, state.questionCount);
    }

    let nextState = { ...applyUpdate(state, updates, false), consecutiveMisses: 0 };
    if (!nextState.audienceType && nextState.questionCount >= 2) {
      const { audienceType } = await detectAudienceType(nextState.context, history);
      nextState = { ...nextState, audienceType };
    }

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

    const insufficientSignal = nextState.questionCount >= 6 && computeOverallCompleteness(nextState.context) < 0.35;
    return buildStreamResponse(generateQuestion(nextField, nextState.phase as never, nextState.context, { insufficientSignal }).textStream, conversationId, nextState.phase, nextState.questionCount);
  } catch (error) {
    log.error('Turn processing failed', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
