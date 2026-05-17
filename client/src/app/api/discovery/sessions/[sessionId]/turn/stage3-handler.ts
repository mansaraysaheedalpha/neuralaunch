// src/app/api/discovery/sessions/[sessionId]/turn/stage3-handler.ts
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
  persistFounderPainPoint,
  markStage3OutputReady,
  safeParseStage3AuthoringState,
  safeParseOutcomeDocument,
  safeParseRequirementsDocument,
  appendStage3RecommendedAction,
  buildPainPoint,
  computeStage3Readiness,
  extractAndPlanStage3,
  streamStage3Message,
  composePainInventoryDocument,
  type Stage3AuthoringState,
  type Stage3AgentMove,
} from '@/lib/ideation';
import type { OutcomeDocument, RequirementsDocument } from '@/lib/ideation';
import type { FallbackStreamResult } from '@/lib/ai/question-stream-fallback';

// ---------------------------------------------------------------------------
// Input contract — same as Stage 1/2 handlers. The parent /turn route
// ran safety gate, rate limit, ownership check, and user-message
// persistence; we trust those invariants.
// ---------------------------------------------------------------------------

export type Stage3HandlerArgs = {
  message:        string;
  history:        string;
  sessionId:      string;
  userId:         string;
  conversationId: string | null;
};

/**
 * Entry point for Stage 3 ('no_idea' + active stage 3) turns.
 *
 * Per-turn order:
 *   1. Load Stage 3 stage run + parse authoring state
 *   2. Load committed Stage 1 OutcomeDocument + Stage 2 RequirementsDocument
 *   3. extractAndPlanStage3 → inputType + founderPainPoints + agentMove
 *      + recommendedAction + readyToCompose + driftDetected
 *   4. Persist founder-surfaced pain points (Human Scout layer)
 *   5. Apply recommendedAction (when move='recommend')
 *   6. Dispatch:
 *        synthesis_request + ready  → compose
 *        synthesis_request + !ready → soft-close stream
 *        soft_close / drift         → soft-close stream
 *        readyToCompose + ready     → compose
 *        otherwise                  → stream chosen move
 */
export async function handleStage3Turn(args: Stage3HandlerArgs): Promise<NextResponse> {
  const { message, history, sessionId, userId, conversationId } = args;
  const log = logger.child({ route: 'POST /api/discovery/sessions/[id]/turn', userId, sessionId, scenario: 'no_idea', stage: 3 });

  // Mark the session as recently active so /discovery's resumption
  // query matches. The query rejects rows with null lastTurnAt; no_idea
  // turn handlers must bump on every turn to stay discoverable. Fire-
  // and-forget — a missed update would just lose one resumption.
  prisma.discoverySession
    .update({ where: { id: sessionId }, data: { lastTurnAt: new Date() }, select: { id: true } })
    .catch(() => { /* non-fatal */ });

  // ── 1. Load + parse Stage 3 run ─────────────────────────────────────────
  const stageRun = await getActiveStageRun(sessionId);
  if (!stageRun) throw new HttpError(500, 'Ideation stage run missing for no_idea session');
  if (stageRun.stageNumber !== 3) {
    // Dispatcher already routed; defensive.
    throw new HttpError(500, 'Dispatched wrong stage to Stage 3 handler');
  }
  if (stageRun.status !== 'authoring') {
    return NextResponse.json({
      error:       'Stage 3 is no longer authoring',
      stageStatus: stageRun.status,
      stageRunId:  stageRun.id,
    }, { status: 409 });
  }

  let state = safeParseStage3AuthoringState(stageRun.output);

  // ── 2. Load upstream committed documents ────────────────────────────────
  const upstream = await loadUpstreamDocuments(sessionId);
  if (!upstream.outcomeDocument) {
    throw new HttpError(500, 'Stage 1 OutcomeDocument missing or not committed');
  }
  if (!upstream.requirementsDocument) {
    throw new HttpError(500, 'Stage 2 RequirementsDocument missing or not committed');
  }
  const { outcomeDocument, requirementsDocument } = upstream;

  // ── 3. Extract + plan ──────────────────────────────────────────────────
  const plan = await extractAndPlanStage3({
    founderMessage:       message,
    conversationHistory:  history,
    state,
    outcomeDocument,
    requirementsDocument,
  });
  log.debug('Stage 3 extract+plan', {
    inputType:    plan.inputType,
    move:         plan.agentMove,
    newFounderPP: plan.founderPainPoints.length,
    drift:        plan.driftDetected,
    ready:        plan.readyToCompose,
  });

  // ── 4. Persist founder-surfaced pain points (Human Scout) ──────────────
  // Each persistFounderPainPoint runs its own read-modify-write inside
  // the store; they layer cleanly because the state we hold is a stale
  // snapshot and we re-load it below for the recommendedAction step.
  for (const fp of plan.founderPainPoints) {
    const built = buildPainPoint({
      source:         'founder',
      description:    fp.description,
      founderContext: fp.founderContext,
      founderNotes:   fp.founderNotes,
    });
    await persistFounderPainPoint(stageRun.id, userId, built);
  }

  // ── 5. Apply recommendedAction inline + re-persist ──────────────────────
  // Re-load the canonical state after founder-pain-point writes so the
  // recommendedAction merge sees the freshest list.
  if (plan.agentMove === 'recommend' && plan.recommendedAction) {
    const fresh = await getActiveStageRun(sessionId);
    if (!fresh || fresh.id !== stageRun.id || fresh.status !== 'authoring') {
      throw new HttpError(409, 'Stage 3 row changed during turn');
    }
    state = safeParseStage3AuthoringState(fresh.output);
    state = appendStage3RecommendedAction(state, {
      action:          plan.recommendedAction.action,
      severity:        plan.recommendedAction.severity,
      raisedAt:        new Date().toISOString(),
      status:          'pending',
      founderResponse: null,
    });
    await persistAuthoringState(stageRun.id, state);
  } else if (plan.founderPainPoints.length > 0) {
    // Founder pain points were persisted in step 4; reload state so
    // downstream readiness check sees the fresh inventory.
    const fresh = await getActiveStageRun(sessionId);
    if (fresh && fresh.id === stageRun.id) {
      state = safeParseStage3AuthoringState(fresh.output);
    }
  }

  // ── 6. Dispatch ────────────────────────────────────────────────────────
  const mechanicallyReady = computeStage3Readiness(state);

  if (plan.inputType === 'synthesis_request') {
    if (mechanicallyReady) {
      return runCompose({
        stageRunId: stageRun.id,
        state,
        outcomeDocument,
        requirementsDocument,
      });
    }
    return streamMove({
      move:                 'soft_close',
      state,
      outcomeDocument,
      requirementsDocument,
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
      message,
      history,
      stageRunId:           stageRun.id,
      conversationId,
    });
  }

  if (plan.readyToCompose && mechanicallyReady) {
    return runCompose({
      stageRunId: stageRun.id,
      state,
      outcomeDocument,
      requirementsDocument,
    });
  }

  return streamMove({
    move:                 plan.agentMove,
    state,
    outcomeDocument,
    requirementsDocument,
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
}> {
  const rows = await prisma.ideationStageRun.findMany({
    where:  { sessionId, stageNumber: { in: [1, 2] }, status: 'committed' },
    select: { stageNumber: true, output: true },
  });
  const stage1 = rows.find(r => r.stageNumber === 1);
  const stage2 = rows.find(r => r.stageNumber === 2);
  return {
    outcomeDocument:      stage1 ? safeParseOutcomeDocument(stage1.output) : null,
    requirementsDocument: stage2 ? safeParseRequirementsDocument(stage2.output) : null,
  };
}

async function runCompose(args: {
  stageRunId:           string;
  state:                Stage3AuthoringState;
  outcomeDocument:      OutcomeDocument;
  requirementsDocument: RequirementsDocument;
}): Promise<NextResponse> {
  const { stageRunId, state, outcomeDocument, requirementsDocument } = args;

  // Persist any in-memory deltas before the LLM call — if composition
  // fails (network, schema), the turn's calibration is not lost.
  await persistAuthoringState(stageRunId, state);

  const doc = await composePainInventoryDocument({
    state,
    outcomeDocument,
    requirementsDocument,
  });
  await markStage3OutputReady(stageRunId, doc);

  return NextResponse.json({
    status:      'output_ready',
    stageRunId,
    stageNumber: 3,
  });
}

async function streamMove(args: {
  move:                 Stage3AgentMove;
  state:                Stage3AuthoringState;
  outcomeDocument:      OutcomeDocument;
  requirementsDocument: RequirementsDocument;
  message:              string;
  history:              string;
  stageRunId:           string;
  conversationId:       string | null;
  recommendedAction?:   { action: string; severity: 'suggested' | 'strongly_advised' } | null;
}): Promise<NextResponse> {
  const {
    move,
    state,
    outcomeDocument,
    requirementsDocument,
    message,
    history,
    stageRunId,
    conversationId,
    recommendedAction,
  } = args;

  await persistAuthoringState(stageRunId, state);

  const result = streamStage3Message({
    move,
    state,
    outcomeDocument,
    requirementsDocument,
    founderMessage:      message,
    conversationHistory: history,
    recommendedAction:   recommendedAction ?? undefined,
  });

  return buildStreamResponse(result, conversationId, move);
}

async function buildStreamResponse(
  result:         FallbackStreamResult,
  conversationId: string | null,
  move:           Stage3AgentMove,
): Promise<NextResponse> {
  const initialAttrs: SpanAttrs =
    move === 'soft_close'
      ? { [ATTR_RESPONSE_TYPE]: 'soft_close' }
      : move === 'shortlist_invite'
        ? { [ATTR_RESPONSE_TYPE]: 'shortlist_invite' }
        : { [ATTR_GENERATION_TYPE]: 'question' };

  const observed = await withStreamingAgentSpan(
    { name: 'ideation.stage3.turn', attributes: initialAttrs },
    () => ({
      stream:    teeDiscoveryStream(result.textStream, conversationId, result.modelUsed),
      modelUsed: result.modelUsed,
      usage:     result.usagePromise,
    }),
  );

  const response = new NextResponse(observed);
  response.headers.set('Content-Type',  'text/plain; charset=utf-8');
  response.headers.set('X-Stage',       '3');
  response.headers.set('X-Stage-Move',  move);
  return response;
}
