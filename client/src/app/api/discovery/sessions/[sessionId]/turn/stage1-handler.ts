// src/app/api/discovery/sessions/[sessionId]/turn/stage1-handler.ts
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
  safeParseStage1AuthoringState,
  applyExtractions,
  appendRecommendedAction,
  computeOutcomeReadiness,
  persistAuthoringState,
  markStage1OutputReady,
  extractAndPlan,
  streamStage1Message,
  composeOutcomeDocument,
  MIN_OUTCOME_FIELD_CONFIDENCE,
  OUTCOME_READINESS_RATIO,
  DIM_KEYS,
  type Stage1AuthoringState,
  type AgentMove,
  type OutcomeDimensions,
} from '@/lib/ideation';
import type { FallbackStreamResult } from '@/lib/ai/question-stream-fallback';

// ---------------------------------------------------------------------------
// Input contract — the route runs the safety gate, validates the body,
// resolves ownership, and persists the user message BEFORE delegating
// here. The handler trusts those invariants and focuses on the
// Stage 1 dispatch logic.
// ---------------------------------------------------------------------------

export type Stage1HandlerArgs = {
  message:        string;
  history:        string;
  sessionId:      string;
  userId:         string;
  conversationId: string | null;
};

/**
 * Entry point for `lifecycleScenario === 'no_idea'` turns.
 *
 * Route-level invariants (NOT re-done here):
 *   - enforceSameOrigin / requireUserId / rateLimitByUser have run
 *   - runSafetyGate ran — block already terminated the session and
 *     the route returned 403 before delegating
 *   - User message persisted to Conversation.messages
 *   - Session ownership confirmed; the route returned 401/404 already
 *
 * Per-turn order inside the handler:
 *   1. Load active IdeationStageRun, parse authoring state
 *   2. extractAndPlan → inputType + extractions + move + drift signals
 *   3. Apply extractions + (move='recommend' ? append action : noop)
 *   4. Dispatch:
 *        synthesis_request + ready  → compose path
 *        synthesis_request + !ready → soft-close stream
 *        soft_close                  → soft-close stream
 *        ready + readyToCompose      → compose path
 *        otherwise                   → stream message at chosen move
 *   5. Persist authoring state (overwrites IdeationStageRun.output)
 *   6. Return streaming response (tee'd through teeDiscoveryStream so
 *      the assistant message lands on the Conversation row with
 *      modelUsed) OR JSON pointing client at review mode
 */
export async function handleStage1Turn(args: Stage1HandlerArgs): Promise<NextResponse> {
  const { message, history, sessionId, userId, conversationId } = args;
  const log = logger.child({ route: 'POST /api/discovery/sessions/[id]/turn', userId, sessionId, scenario: 'no_idea' });

  // Mark the session as recently active so the /discovery resumption
  // detection treats it the same as a legacy Discovery turn. Without
  // this, lastTurnAt stays null forever for no_idea sessions and the
  // sidebar's link-to-/discovery → page-redirect chain fails to find
  // the session, sending the founder back to the archetype picker.
  // Fire-and-forget — a write failure here would just lose resumption
  // for one turn, not break the actual turn.
  prisma.discoverySession
    .update({ where: { id: sessionId }, data: { lastTurnAt: new Date() }, select: { id: true } })
    .catch(() => { /* non-fatal */ });

  // ── 1. Load + parse stage run ───────────────────────────────────────────
  const stageRun = await getActiveStageRun(sessionId);
  if (!stageRun) {
    throw new HttpError(500, 'Ideation stage run missing for no_idea session');
  }
  if (stageRun.stageNumber === 1 && stageRun.status !== 'authoring') {
    // Founder is on a Stage 1 row that's already output_ready or
    // committed — the client should be on the review screen, not
    // /turn. Return a 409 so the client can redirect.
    return NextResponse.json({
      error:        'Stage 1 is no longer authoring',
      stageStatus:  stageRun.status,
      stageRunId:   stageRun.id,
    }, { status: 409 });
  }
  if (stageRun.stageNumber !== 1) {
    // Stages 2..5 not implemented yet — surface a clear 501 to the
    // client (the page should render a "coming soon" placeholder).
    return NextResponse.json({
      error:       'Stage not implemented',
      stageNumber: stageRun.stageNumber,
    }, { status: 501 });
  }

  let authoring = safeParseStage1AuthoringState(stageRun.output);

  // Telemetry: capture confidences BEFORE the extraction step so the
  // log line below shows the delta this turn produced. The readiness
  // gate constants (MIN_OUTCOME_FIELD_CONFIDENCE 0.65 / OUTCOME_READINESS_RATIO 0.75)
  // are hard-coded; real-world distributions live here so we can tune
  // them against actual founder data rather than guesses. Bug 8.
  const priorConfidences = snapshotConfidences(authoring.dimensions);

  // ── 2. Extract + plan ───────────────────────────────────────────────────
  const plan = await extractAndPlan(message, history, authoring);
  log.debug('Stage 1 extract+plan', {
    inputType:     plan.inputType,
    move:          plan.agentMove,
    extractions:   plan.extractions.length,
    drift:         plan.driftDetected,
    readyToCompose: plan.readyToCompose,
  });

  // ── 3. Apply extractions; append recommended action when move=recommend ──
  authoring = applyExtractions(authoring, plan.extractions);
  if (plan.agentMove === 'recommend' && plan.recommendedAction) {
    authoring = appendRecommendedAction(authoring, {
      action:          plan.recommendedAction.action,
      severity:        plan.recommendedAction.severity,
      raisedAt:        new Date().toISOString(),
      status:          'pending',
      founderResponse: null,
    });
  }

  const mechanicallyReady = computeOutcomeReadiness(authoring);
  const newConfidences  = snapshotConfidences(authoring.dimensions);
  const meanConfidence  = (newConfidences.timeHorizon + newConfidences.financialGoal +
                           newConfidences.riskTolerance + newConfidences.lifestylePreference) / 4;
  const allAboveFloor   = DIM_KEYS.every(k => newConfidences[k] >= MIN_OUTCOME_FIELD_CONFIDENCE);
  log.debug('Stage 1 readiness gate', {
    prior:             priorConfidences,
    next:              newConfidences,
    mean:              Number(meanConfidence.toFixed(3)),
    allAboveFloor,
    meetsRatio:        meanConfidence >= OUTCOME_READINESS_RATIO,
    mechanicallyReady,
    agentReady:        plan.readyToCompose,
    constants:         { floor: MIN_OUTCOME_FIELD_CONFIDENCE, ratio: OUTCOME_READINESS_RATIO },
  });

  // ── 4. Dispatch ─────────────────────────────────────────────────────────
  if (plan.inputType === 'synthesis_request') {
    if (mechanicallyReady) {
      return composeAndPersist({ stageRunId: stageRun.id, authoring, history, sessionId });
    }
    // Founder asked to wrap up but the mechanical gate isn't met —
    // stream a soft-close so the agent surfaces what we have and asks
    // them to commit to it / fill the gap.
    return streamMove({
      move:           'soft_close',
      authoring,
      message,
      history,
      stageRunId:     stageRun.id,
      conversationId,
    });
  }

  if (plan.agentMove === 'soft_close' || plan.driftDetected) {
    return streamMove({
      move:           'soft_close',
      authoring,
      message,
      history,
      stageRunId:     stageRun.id,
      conversationId,
    });
  }

  if (plan.readyToCompose && mechanicallyReady) {
    return composeAndPersist({ stageRunId: stageRun.id, authoring, history, sessionId });
  }

  return streamMove({
    move:               plan.agentMove,
    authoring,
    message,
    history,
    stageRunId:         stageRun.id,
    conversationId,
    recommendedAction:  plan.recommendedAction,
  });
}

// ---------------------------------------------------------------------------
// Compose + persist — the readyToCompose+gate path AND the
// synthesis_request happy path both land here.
// ---------------------------------------------------------------------------

async function composeAndPersist(args: {
  stageRunId: string;
  authoring:  Stage1AuthoringState;
  history:    string;
  sessionId:  string;
}): Promise<NextResponse> {
  const { stageRunId, authoring, history } = args;

  // Persist the authoring state once before composing, so even if the
  // composer call fails (network, validation, etc.) the conversational
  // progress is not lost.
  await persistAuthoringState(stageRunId, authoring);

  const doc = await composeOutcomeDocument(authoring, history);
  await markStage1OutputReady(stageRunId, doc);

  return NextResponse.json({
    status:     'output_ready',
    stageRunId,
    stageNumber: 1,
  }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Stream a move — persists the authoring state, then pipes the message
// through teeDiscoveryStream so the assistant message lands on the
// Conversation row with modelUsed.
// ---------------------------------------------------------------------------

async function streamMove(args: {
  move:                AgentMove;
  authoring:           Stage1AuthoringState;
  message:             string;
  history:             string;
  stageRunId:          string;
  conversationId:      string | null;
  recommendedAction?:  { action: string; severity: 'suggested' | 'strongly_advised' } | null;
}): Promise<NextResponse> {
  const { move, authoring, message, history, stageRunId, conversationId, recommendedAction } = args;

  await persistAuthoringState(stageRunId, authoring);

  const result = streamStage1Message({
    move,
    state:               authoring,
    founderMessage:      message,
    conversationHistory: history,
    recommendedAction:   recommendedAction ?? undefined,
  });

  return buildStreamResponse(result, conversationId, move);
}

async function buildStreamResponse(
  result:         FallbackStreamResult,
  conversationId: string | null,
  move:           AgentMove,
): Promise<NextResponse> {
  // soft_close is the only path that conceptually deviates from a
  // standard 'question' generation — surface it as the response type
  // so dashboards can split the metric. probe / ground / recommend
  // are all conversational generations.
  const initialAttrs: SpanAttrs = move === 'soft_close'
    ? { [ATTR_RESPONSE_TYPE]: 'soft_close' }
    : { [ATTR_GENERATION_TYPE]: 'question' };

  const observed = await withStreamingAgentSpan(
    { name: 'ideation.stage1.turn', attributes: initialAttrs },
    () => ({
      stream:    teeDiscoveryStream(result.textStream, conversationId, result.modelUsed),
      modelUsed: result.modelUsed,
      usage:     result.usagePromise,
    }),
  );

  const response = new NextResponse(observed);
  response.headers.set('Content-Type',  'text/plain; charset=utf-8');
  response.headers.set('X-Stage',       '1');
  response.headers.set('X-Stage-Move',  move);
  return response;
}

// ---------------------------------------------------------------------------
// Telemetry helper — flat per-axis confidence snapshot for the
// readiness-gate log line. Three-decimal precision keeps the log
// compact while preserving enough fidelity to read distribution
// shapes off later.
// ---------------------------------------------------------------------------

function snapshotConfidences(dims: OutcomeDimensions): Record<typeof DIM_KEYS[number], number> {
  return {
    timeHorizon:         Number(dims.timeHorizon.confidence.toFixed(3)),
    financialGoal:       Number(dims.financialGoal.confidence.toFixed(3)),
    riskTolerance:       Number(dims.riskTolerance.confidence.toFixed(3)),
    lifestylePreference: Number(dims.lifestylePreference.confidence.toFixed(3)),
  };
}
