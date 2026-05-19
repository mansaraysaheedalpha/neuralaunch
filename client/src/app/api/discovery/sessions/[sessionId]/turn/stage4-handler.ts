// src/app/api/discovery/sessions/[sessionId]/turn/stage4-handler.ts
import 'server-only';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { HttpError } from '@/lib/validation/server-helpers';
import { teeDiscoveryStream } from '@/lib/discovery';
import {
  withStreamingAgentSpan,
  ATTR_GENERATION_TYPE,
  ATTR_RESPONSE_TYPE,
} from '@/lib/observability';
import type { SpanAttrs } from '@/lib/observability';
import {
  getActiveStageRun,
  persistAuthoringState,
  markStage4OutputReady,
  safeParseStage4AuthoringState,
  safeParseOutcomeDocument,
  safeParseRequirementsDocument,
  safeParsePainInventoryDocument,
  appendStage4RecommendedAction,
  computeStage4Readiness,
  extractAndPlanStage4,
  streamStage4Message,
  composeOpportunityEvaluationsDocument,
  type Stage4AuthoringState,
  type Stage4AgentMove,
} from '@/lib/ideation';
import type {
  OutcomeDocument,
  RequirementsDocument,
  PainInventoryDocument,
} from '@/lib/ideation';
import type { FallbackStreamResult } from '@/lib/ai/question-stream-fallback';

// ---------------------------------------------------------------------------
// Input contract — same as Stage 1/2/3 handlers. The parent /turn
// route ran safety gate, rate limit, ownership check, and user-
// message persistence; we trust those invariants.
// ---------------------------------------------------------------------------

export type Stage4HandlerArgs = {
  message:        string;
  history:        string;
  sessionId:      string;
  userId:         string;
  conversationId: string | null;
};

/**
 * Entry point for Stage 4 ('no_idea' + active stage 4) turns.
 *
 * Stage 4's canvas is the truth surface; the chat is supplementary.
 * The handler runs the structured extractor to choose a move and
 * streams the agent's reply. Verdicts, scores, response capture all
 * happen through dedicated canvas routes — NOT chat.
 *
 * Per-turn order:
 *   1. Load Stage 4 stage run + parse authoring state
 *   2. Load committed Stage 1 + Stage 2 + Stage 3 documents
 *   3. extractAndPlanStage4 → inputType + agentMove + recommendedAction
 *      + readyToCompose + driftDetected
 *   4. Apply recommendedAction (when move='recommend')
 *   5. Dispatch:
 *        synthesis_request + ready  → compose
 *        synthesis_request + !ready → soft-close stream
 *        soft_close / drift         → soft-close stream
 *        readyToCompose + ready     → compose
 *        otherwise                  → stream chosen move
 */
export async function handleStage4Turn(args: Stage4HandlerArgs): Promise<NextResponse> {
  const { message, history, sessionId, userId, conversationId } = args;
  const log = logger.child({ route: 'POST /api/discovery/sessions/[id]/turn', userId, sessionId, scenario: 'no_idea', stage: 4 });

  // Bump lastTurnAt so /discovery resumption picks the session up.
  prisma.discoverySession
    .update({ where: { id: sessionId }, data: { lastTurnAt: new Date() }, select: { id: true } })
    .catch(() => { /* non-fatal */ });

  // ── 1. Load + parse Stage 4 run ─────────────────────────────────────────
  const stageRun = await getActiveStageRun(sessionId);
  if (!stageRun) throw new HttpError(500, 'Ideation stage run missing for no_idea session');
  if (stageRun.stageNumber !== 4) {
    throw new HttpError(500, 'Dispatched wrong stage to Stage 4 handler');
  }
  if (stageRun.status !== 'authoring') {
    return NextResponse.json({
      error:       'Stage 4 is no longer authoring',
      stageStatus: stageRun.status,
      stageRunId:  stageRun.id,
    }, { status: 409 });
  }

  let state = safeParseStage4AuthoringState(stageRun.output);

  // ── 2. Load upstream committed documents ────────────────────────────────
  const upstream = await loadUpstreamDocuments(sessionId);
  if (!upstream.outcomeDocument)       throw new HttpError(500, 'Stage 1 OutcomeDocument missing or not committed');
  if (!upstream.requirementsDocument)  throw new HttpError(500, 'Stage 2 RequirementsDocument missing or not committed');
  if (!upstream.painInventoryDoc)      throw new HttpError(500, 'Stage 3 PainInventoryDocument missing or not committed');
  const { outcomeDocument, requirementsDocument, painInventoryDoc } = upstream;

  // ── 3. Extract + plan ──────────────────────────────────────────────────
  const plan = await extractAndPlanStage4({
    founderMessage:       message,
    conversationHistory:  history,
    state,
    outcomeDocument,
    requirementsDocument,
    painInventoryDoc,
  });
  log.debug('Stage 4 extract+plan', {
    inputType: plan.inputType,
    move:      plan.agentMove,
    drift:     plan.driftDetected,
    ready:     plan.readyToCompose,
  });

  // ── 4. Apply recommendedAction inline + re-persist ──────────────────────
  if (plan.agentMove === 'recommend' && plan.recommendedAction) {
    state = appendStage4RecommendedAction(state, {
      action:          plan.recommendedAction.action,
      severity:        plan.recommendedAction.severity,
      raisedAt:        new Date().toISOString(),
      status:          'pending',
      founderResponse: null,
    });
    await persistAuthoringState(stageRun.id, state);
  }

  // ── 5. Dispatch ────────────────────────────────────────────────────────
  const mechanicallyReady = computeStage4Readiness(state);

  if (plan.inputType === 'synthesis_request') {
    if (mechanicallyReady) {
      return runCompose({ stageRunId: stageRun.id, state });
    }
    return streamMove({
      move:                 'soft_close',
      state,
      outcomeDocument,
      requirementsDocument,
      painInventoryDoc,
      message,
      history,
      stageRunId:           stageRun.id,
      conversationId,
    });
  }

  if (plan.agentMove === 'soft_close' || plan.driftDetected) {
    return streamMove({
      move:                 'soft_close',
      state,
      outcomeDocument,
      requirementsDocument,
      painInventoryDoc,
      message,
      history,
      stageRunId:           stageRun.id,
      conversationId,
    });
  }

  if (plan.readyToCompose && mechanicallyReady) {
    return runCompose({ stageRunId: stageRun.id, state });
  }

  return streamMove({
    move:                 plan.agentMove,
    state,
    outcomeDocument,
    requirementsDocument,
    painInventoryDoc,
    message,
    history,
    stageRunId:           stageRun.id,
    conversationId,
    recommendedAction:    plan.recommendedAction,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadUpstreamDocuments(sessionId: string): Promise<{
  outcomeDocument:      OutcomeDocument | null;
  requirementsDocument: RequirementsDocument | null;
  painInventoryDoc:     PainInventoryDocument | null;
}> {
  const rows = await prisma.ideationStageRun.findMany({
    where:  { sessionId, stageNumber: { in: [1, 2, 3] }, status: 'committed' },
    select: { stageNumber: true, output: true },
  });
  const s1 = rows.find(r => r.stageNumber === 1);
  const s2 = rows.find(r => r.stageNumber === 2);
  const s3 = rows.find(r => r.stageNumber === 3);
  return {
    outcomeDocument:      s1 ? safeParseOutcomeDocument(s1.output)         : null,
    requirementsDocument: s2 ? safeParseRequirementsDocument(s2.output)    : null,
    painInventoryDoc:     s3 ? safeParsePainInventoryDocument(s3.output)   : null,
  };
}

async function runCompose(args: { stageRunId: string; state: Stage4AuthoringState }): Promise<NextResponse> {
  const { stageRunId, state } = args;
  await persistAuthoringState(stageRunId, state);
  const doc = await composeOpportunityEvaluationsDocument({ state });
  await markStage4OutputReady(stageRunId, doc);
  return NextResponse.json({ status: 'output_ready', stageRunId, stageNumber: 4 });
}

async function streamMove(args: {
  move:                 Stage4AgentMove;
  state:                Stage4AuthoringState;
  outcomeDocument:      OutcomeDocument;
  requirementsDocument: RequirementsDocument;
  painInventoryDoc:     PainInventoryDocument;
  message:              string;
  history:              string;
  stageRunId:           string;
  conversationId:       string | null;
  recommendedAction?:   { action: string; severity: 'suggested' | 'strongly_advised' } | null;
}): Promise<NextResponse> {
  const {
    move, state, outcomeDocument, requirementsDocument, painInventoryDoc,
    message, history, stageRunId, conversationId, recommendedAction,
  } = args;

  await persistAuthoringState(stageRunId, state);

  const result = streamStage4Message({
    move,
    state,
    outcomeDocument,
    requirementsDocument,
    painInventoryDoc,
    founderMessage:      message,
    conversationHistory: history,
    recommendedAction:   recommendedAction ?? undefined,
  });

  return buildStreamResponse(result, conversationId, move);
}

async function buildStreamResponse(
  result:         FallbackStreamResult,
  conversationId: string | null,
  move:           Stage4AgentMove,
): Promise<NextResponse> {
  const initialAttrs: SpanAttrs =
    move === 'soft_close'      ? { [ATTR_RESPONSE_TYPE]: 'soft_close' } :
    move === 'compose_invite'  ? { [ATTR_RESPONSE_TYPE]: 'compose_invite' } :
                                 { [ATTR_GENERATION_TYPE]: 'question' };

  const observed = await withStreamingAgentSpan(
    { name: 'ideation.stage4.turn', attributes: initialAttrs },
    () => ({
      stream:    teeDiscoveryStream(result.textStream, conversationId, result.modelUsed),
      modelUsed: result.modelUsed,
      usage:     result.usagePromise,
    }),
  );

  const response = new NextResponse(observed);
  response.headers.set('Content-Type',  'text/plain; charset=utf-8');
  response.headers.set('X-Stage',       '4');
  response.headers.set('X-Stage-Move',  move);
  return response;
}
