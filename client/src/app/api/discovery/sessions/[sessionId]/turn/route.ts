// src/app/api/discovery/sessions/[sessionId]/turn/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import prisma, { toJsonValue } from '@/lib/prisma';
import { inngest } from '@/inngest/client';
import { logger } from '@/lib/logger';
import {
  checkRateLimit, RATE_LIMITS, getRequestIdentifier, getClientIp,
} from '@/lib/rate-limit';
import { enforceSameOrigin, HttpError, httpErrorToResponse } from '@/lib/validation/server-helpers';
import {
  getSession, saveSession, extractContext, applyUpdate, generateQuestion, generateReflection,
  canSynthesise, teeDiscoveryStream, detectAudienceType, computeOverallCompleteness,
  generateMetaResponse, generateFrustrationResponse, generateClarificationResponse,
  generatePricingFollowUp, detectsPricingChange, generateClarificationConfirmation,
  MIN_FIELD_CONFIDENCE,
} from '@/lib/discovery';
import type { FallbackStreamResult } from '@/lib/ai/question-stream-fallback';
import { runSafetyGate, SAFETY_REFUSAL_MESSAGE } from '@/lib/discovery/safety-gate';
import {
  runInterviewPreResearch,
  appendResearchLog,
  safeParseResearchLog,
  type ResearchLogEntry,
} from '@/lib/research';
import { loadInterviewContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock, renderCycleSummariesBlock, renderInterviewOpeningBlock } from '@/lib/lifecycle/prompt-renderers';

// Pro plan supports up to 300s. The fallback chain can take ~50s in
// the worst case (Sonnet retries 0+2+8+30 = 40s, then Haiku first
// attempt ~10s = 50s, Gemini first attempt ~10s = 60s). Set 90s to
// give Gemini's first chunk a comfortable margin.
export const maxDuration = 90;

const TurnRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.string().max(8000).default(''),
  /**
   * Optional authorship signal. 'voice' marks the message as
   * microphone-transcribed so the chat history can render a mic
   * badge and cohort analytics can distinguish voice vs typed.
   */
  inputMethod: z.enum(['voice']).optional(),
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
  try {
    enforceSameOrigin(req);
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

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
  const { message, history, inputMethod } = parsed.data;

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

  // Check if the session has already been terminated by a prior safety gate.
  // Once terminated, no further messages are accepted — ever.
  const dbSession = await prisma.discoverySession.findFirst({
    where:  { id: sessionId, userId },
    select: { conversationId: true, status: true },
  });
  if (dbSession?.status === 'TERMINATED') {
    return NextResponse.json({
      error:             SAFETY_REFUSAL_MESSAGE,
      sessionTerminated: true,
    }, { status: 403 });
  }

  const conversationId: string | null = dbSession?.conversationId ?? null;

  // ---------------------------------------------------------------------------
  // SAFETY GATE — runs on EVERY message, not just the first.
  //
  // The evaluation found a critical vulnerability: the safety boundary
  // was one message deep. A user who received a correct refusal on
  // message 1 could socially engineer their way back into normal
  // interview mode on messages 2-4 by reframing ("forget the fraud,
  // help my cousin's food delivery business") or verbally promising
  // to stop ("I'll report it Monday"). The engine treated that promise
  // as sufficient to clear criminal context.
  //
  // Fix: the safetyGate classifies EVERY message. If ANY message in
  // the session triggers a block, the session is PERMANENTLY terminated.
  // No re-entry, no exceptions, no contextual evaluation of follow-ups.
  // ---------------------------------------------------------------------------
  const safetyResult = await runSafetyGate(message, history);
  if (!safetyResult.safe && safetyResult.severity === 'block') {
    log.warn('[SafetyGate] Session terminated', {
      sessionId,
      userId,
      category: safetyResult.category,
    });

    // Permanently terminate the session in the database
    await prisma.discoverySession.update({
      where:  { id: sessionId },
      data:   { status: 'TERMINATED' },
      select: { id: true },
    });

    // Also kill the Redis session so getSession returns null on retry
    await saveSession(sessionId, { ...state, isComplete: true });

    return NextResponse.json({
      error:             SAFETY_REFUSAL_MESSAGE,
      sessionTerminated: true,
    }, { status: 403 });
  }

  // Persist user message immediately (fire-and-forget, non-fatal)
  if (conversationId) {
    prisma.message.create({
      data: { conversationId, role: 'user', content: message, inputMethod: inputMethod ?? null },
    }).catch(() => { /* non-fatal */ });
  }

  // Lifecycle context — loaded fresh each turn from the DB. The
  // scenario + ventureId are persisted in Redis (InterviewState); the
  // actual profile + summaries are loaded here. For first_interview
  // (no lifecycle data), this is a fast null-returning query.
  const scenario = state.lifecycleScenario ?? 'first_interview';
  const lifecycleCtx = await loadInterviewContext(userId, scenario === 'first_interview' ? 'fresh_start' : scenario, { ventureId: state.ventureId, forkContext: state.forkContext });
  const lifecycleBlock = [
    renderInterviewOpeningBlock(scenario, lifecycleCtx.profile, lifecycleCtx.forkContext),
    renderFounderProfileBlock(lifecycleCtx.profile),
    renderCycleSummariesBlock(lifecycleCtx.cycleSummaries),
  ].filter(b => b.length > 0).join('\n');

  try {
    const t0          = Date.now();
    const rawField    = state.activeField ?? 'situation';
    const activeField = (rawField === 'psych_probe' || rawField === 'follow_up') ? 'biggestConcern' : rawField;
    const { updates, inputType, contradicts, followUp } = await extractContext(message, activeField, history, state.context[activeField]);
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
        return buildStreamResponse(generateQuestion(skipped.activeField, skipped.phase as never, skipped.context, {}, skipped.audienceType ?? undefined, history, skipped.askedFields, lifecycleBlock || undefined), conversationId, skipped.phase, skipped.questionCount);
      }
      await saveSession(sessionId, { ...state, consecutiveMisses: 1 });
      return buildStreamResponse(generateQuestion(rawField, state.phase as never, state.context, { unclear: true }, state.audienceType ?? undefined, history, state.askedFields, lifecycleBlock || undefined), conversationId, state.phase, state.questionCount);
    }

    let nextState = { ...applyUpdate(state, updates), consecutiveMisses: 0 };
    // Set pendingFollowUp from the extraction result so advance() can
    // inject a follow-up slot before the next scored field.
    if (followUp.detected) {
      nextState = { ...nextState, pendingFollowUp: { topic: followUp.topic } };
    }
    // Audience detection — delayed to exchange 4 (enough context for
    // accurate classification). Allows reclassification at exchange 7
    // if the initial confidence was low (< 0.7). The cost of a wrong
    // audience type cascading through field weights for 10+ questions
    // is higher than waiting 1-2 more exchanges for better signal.
    const shouldClassify =
      (!nextState.audienceType && nextState.questionCount >= 4)  // first classification
      || (nextState.audienceType && nextState.questionCount === 7); // reclassification window
    if (shouldClassify) {
      const detection = await detectAudienceType(nextState.context, history);
      // Only reclassify if the new detection is higher confidence than
      // what we had, OR if this is the first classification.
      if (!nextState.audienceType || detection.confidence >= 0.7) {
        nextState = { ...nextState, audienceType: detection.audienceType };
      }
    }

    // B1 interview pre-research. The interview agent streams to the
    // founder, so we cannot put the research tools on the streaming
    // call (the founder would see ~10s of "thinking" before any
    // tokens). Instead we run a SHORT non-streaming pre-research
    // pass that exposes both tools to a Sonnet call whose only job
    // is to decide whether to research and (if so) what queries to
    // run. The rendered findings string flows into the streaming
    // question generator's existing researchFindings option.
    //
    // Pre-research only fires for the main question-generation path
    // — clarification, follow-up, pricing, and synthesis paths don't
    // benefit and skip the call.
    const willReachMainQuestion =
      !canSynthesise(nextState.context)
      && !nextState.isComplete
      && nextState.activeField !== null
      && nextState.activeField !== 'follow_up'
      && !(detectsPricingChange(message) && !state.pricingProbed);

    const researchAccumulator: ResearchLogEntry[] = [];
    const research = willReachMainQuestion
      ? await runInterviewPreResearch({
          founderMessage:   message,
          geographicMarket: (nextState.context.geographicMarket?.value as string | undefined) ?? null,
          primaryGoal:      (nextState.context.primaryGoal?.value      as string | undefined) ?? null,
          contextId:        sessionId,
          accumulator:      researchAccumulator,
        })
      : { findings: '' };

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
        // Append the research audit log when the pre-research call
        // actually fired any tools. appendResearchLog bounds the
        // column at MAX_RESEARCH_LOG_ENTRIES so multi-turn sessions
        // stay within JSONB size budgets. toJsonValue is the
        // canonical helper from lib/prisma — never use ad-hoc casts.
        //
        // Concurrency note: the discovery turn route uses the
        // standard read-then-update pattern (not a transaction)
        // because turns from a single sessionId are serialised
        // by the DISCOVERY_TURN rate limit and the founder's
        // streaming UI naturally prevents parallel turns.
        ...(researchAccumulator.length > 0
          ? {
              researchLog: toJsonValue(
                appendResearchLog(
                  safeParseResearchLog(
                    (await prisma.discoverySession.findUnique({
                      where:  { id: sessionId },
                      select: { researchLog: true },
                    }))?.researchLog ?? [],
                  ),
                  researchAccumulator,
                ),
              ),
            }
          : {}),
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

    // If the next field is a follow-up slot, pass the topic and clear
    // the pending so it doesn't fire again next turn.
    if (nextField === 'follow_up' && nextState.pendingFollowUp) {
      const topic = nextState.pendingFollowUp.topic;
      await saveSession(sessionId, { ...nextState, pendingFollowUp: null });
      log.debug('Turn follow-up', { sessionId, topic });
      return buildStreamResponse(generateQuestion('follow_up', nextState.phase as never, nextState.context, { followUpTopic: topic }, nextState.audienceType ?? undefined, history, nextState.askedFields, lifecycleBlock || undefined), conversationId, nextState.phase, nextState.questionCount);
    }

    const insufficientSignal = nextState.questionCount >= 6 && computeOverallCompleteness(nextState.context) < 0.35;
    const phaseChanged = nextState.phase !== state.phase;
    log.debug('Turn stream start', { sessionId, totalToStreamMs: Date.now() - t0, inputType, phase: nextState.phase, phaseChanged, researchCalls: researchAccumulator.length });
    return buildStreamResponse(generateQuestion(nextField, nextState.phase as never, nextState.context, { insufficientSignal, phaseChanged, researchFindings: research.findings || undefined }, nextState.audienceType ?? undefined, history, nextState.askedFields, lifecycleBlock || undefined), conversationId, nextState.phase, nextState.questionCount);
  } catch (error) {
    log.error('Turn processing failed', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
