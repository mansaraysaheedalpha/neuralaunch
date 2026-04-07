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
  getSession, saveSession, extractContext, applyUpdate, generateQuestion, generateReflection,
  canSynthesise, teeDiscoveryStream, detectAudienceType, computeOverallCompleteness,
  generateMetaResponse, generateFrustrationResponse, generateClarificationResponse,
  generatePricingFollowUp, detectsPricingChange, generateClarificationConfirmation,
  MIN_FIELD_CONFIDENCE,
} from '@/lib/discovery';
import type { FallbackStreamResult } from '@/lib/ai/question-stream-fallback';

// Pro plan supports up to 300s. The fallback chain can take ~50s in
// the worst case (Sonnet retries 0+2+8+30 = 40s, then Haiku first
// attempt ~10s = 50s, Gemini first attempt ~10s = 60s). Set 90s to
// give Gemini's first chunk a comfortable margin.
export const maxDuration = 90;

const TurnRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.string().max(8000).default(''),
});

/**
 * Build a streaming NextResponse from a fallback-orchestrated result.
 * Pipes the textStream through teeDiscoveryStream so the assistant
 * message is persisted alongside, with the resolved provider id stored
 * in modelUsed for observability.
 */
function buildStreamResponse(
  result: FallbackStreamResult,
  cid:    string | null,
  phase:  string,
  count:  number,
): NextResponse {
  const r = new NextResponse(teeDiscoveryStream(result.textStream, cid, result.modelUsed));
  r.headers.set('Content-Type', 'text/plain; charset=utf-8');
  r.headers.set('X-Phase', phase);
  r.headers.set('X-Question-Count', String(count));
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

  // Fetch conversationId for message persistence (best-effort — non-blocking).
  // Redis state already verified userId above; the userId in the where clause
  // is defence-in-depth in case the Redis check is ever loosened.
  const dbSession = await prisma.discoverySession.findFirst({
    where:  { id: sessionId, userId },
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
    const t0          = Date.now();
    const rawField    = state.activeField ?? 'situation';
    const activeField = rawField === 'psych_probe' ? 'biggestConcern' : rawField;
    const { updates, inputType, contradicts } = await extractContext(message, activeField, history, state.context[activeField]);
    if (inputType === 'offtopic') { await saveSession(sessionId, state); return buildStreamResponse(generateMetaResponse(message, state.phase, state.questionCount, history), conversationId, state.phase, state.questionCount); }
    if (inputType === 'frustrated') { await saveSession(sessionId, state); return buildStreamResponse(generateFrustrationResponse(message, activeField, history), conversationId, state.phase, state.questionCount); }
    if (inputType === 'clarification') { const lq = history.split('\n').filter(l => l.startsWith('assistant:')).pop()?.replace(/^assistant:\s*/, '') ?? ''; await saveSession(sessionId, state); return buildStreamResponse(generateClarificationConfirmation(message, lq, activeField, history, state.audienceType ?? undefined), conversationId, state.phase, state.questionCount); }
    if (inputType === 'synthesis_request') { await saveSession(sessionId, { ...state, isComplete: true }); await inngest.send({ name: 'discovery/synthesis.requested', data: { sessionId, userId } }); await prisma.discoverySession.update({ where: { id: sessionId }, data: { status: 'COMPLETE', completedAt: new Date() }, select: { id: true } }); const sr = buildStreamResponse(generateReflection(state.context, state.audienceType, history), conversationId, 'SYNTHESIS', state.questionCount); sr.headers.set('X-Synthesis-Transition', 'true'); return sr; }
    if (contradicts) { await saveSession(sessionId, state); return buildStreamResponse(generateClarificationResponse(message, activeField, state.context[activeField], history), conversationId, state.phase, state.questionCount); }
    // Genuine extraction miss — re-ask with clarification, or skip after 2 consecutive misses
    if (Object.keys(updates).length === 0) {
      if (state.consecutiveMisses >= 1) {
        const skipCtx = rawField !== 'psych_probe' ? { ...state.context, [activeField]: { ...state.context[activeField], confidence: MIN_FIELD_CONFIDENCE } } : state.context;
        const skipped = { ...applyUpdate({ ...state, context: skipCtx }, {}), consecutiveMisses: 0 };
        await saveSession(sessionId, skipped);
        if (!skipped.activeField) return NextResponse.json({ status: 'synthesizing' });
        return buildStreamResponse(generateQuestion(skipped.activeField, skipped.phase as never, skipped.context, {}, skipped.audienceType ?? undefined, history, skipped.askedFields), conversationId, skipped.phase, skipped.questionCount);
      }
      await saveSession(sessionId, { ...state, consecutiveMisses: 1 });
      return buildStreamResponse(generateQuestion(rawField, state.phase as never, state.context, { unclear: true }, state.audienceType ?? undefined, history, state.askedFields), conversationId, state.phase, state.questionCount);
    }

    let nextState = { ...applyUpdate(state, updates), consecutiveMisses: 0 };
    if (!nextState.audienceType && nextState.questionCount >= 2) { const { audienceType } = await detectAudienceType(nextState.context, history); nextState = { ...nextState, audienceType }; }

    await saveSession(sessionId, nextState);
    await prisma.discoverySession.update({
      where: { id: sessionId },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        beliefState:           JSON.parse(JSON.stringify(nextState.context)),
        phase:                 nextState.phase,
        questionCount:         nextState.questionCount,
        questionsInPhase:      nextState.questionsInPhase,
        activeField:           nextState.activeField ?? null,
        audienceType:          nextState.audienceType ?? null,
        askedFields:           nextState.askedFields,
        pricingProbed:         nextState.pricingProbed,
        psychConstraintProbed: nextState.psychConstraintProbed,
        lastTurnAt:            new Date(),
      },
      select: { id: true },
    });
    log.debug('Turn checkpoint', { sessionId, dbWriteMs: Date.now() - t0, questionCount: nextState.questionCount });
    if (canSynthesise(nextState.context) || nextState.isComplete) {
      await inngest.send({ name: 'discovery/synthesis.requested', data: { sessionId, userId } });
      await prisma.discoverySession.update({ where: { id: sessionId }, data: { status: 'COMPLETE', completedAt: new Date() }, select: { id: true } });
      const ref = buildStreamResponse(generateReflection(nextState.context, nextState.audienceType, history), conversationId, 'SYNTHESIS', nextState.questionCount);
      ref.headers.set('X-Synthesis-Transition', 'true'); return ref;
    }
    const nextField = nextState.activeField;
    if (!nextField) return NextResponse.json({ status: 'synthesizing' }, { status: 200 });
    if (detectsPricingChange(message) && !state.pricingProbed) { await saveSession(sessionId, { ...nextState, pricingProbed: true }); return buildStreamResponse(generatePricingFollowUp(message, history, nextState.audienceType ?? undefined), conversationId, nextState.phase, nextState.questionCount); }
    const insufficientSignal = nextState.questionCount >= 6 && computeOverallCompleteness(nextState.context) < 0.35;
    log.debug('Turn stream start', { sessionId, totalToStreamMs: Date.now() - t0, inputType, phase: nextState.phase });
    return buildStreamResponse(generateQuestion(nextField, nextState.phase as never, nextState.context, { insufficientSignal }, nextState.audienceType ?? undefined, history, nextState.askedFields), conversationId, nextState.phase, nextState.questionCount);
  } catch (error) {
    log.error('Turn processing failed', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
