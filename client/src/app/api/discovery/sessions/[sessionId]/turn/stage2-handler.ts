// src/app/api/discovery/sessions/[sessionId]/turn/stage2-handler.ts
import 'server-only';
import { NextResponse } from 'next/server';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { HttpError } from '@/lib/validation/server-helpers';
import { teeDiscoveryStream } from '@/lib/discovery';
import {
  withStreamingAgentSpan,
  ATTR_GENERATION_TYPE,
  ATTR_RESPONSE_TYPE,
} from '@/lib/observability';
import type { SpanAttrs } from '@/lib/observability';
import { parseHistory } from '@/lib/discovery/question-generator';
import {
  getActiveStageRun,
  persistAuthoringState,
  markStage2OutputReady,
  safeParseStage2AuthoringState,
  safeParseOutcomeDocument,
  applyStage2Extractions,
  appendStage2RecommendedAction,
  computeStage2Readiness,
  extractAndPlanStage2,
  streamStage2Message,
  streamTargetedTeamQuestion,
  composeRequirementsDocument,
  deriveExpectedProfile,
  outcomeDemandsTeam,
  type Stage2AuthoringState,
  type Stage2AgentMove,
  type SkillUpdate,
} from '@/lib/ideation';
import type { OutcomeDocument } from '@/lib/ideation';
import type { FallbackStreamResult } from '@/lib/ai/question-stream-fallback';

// ---------------------------------------------------------------------------
// Input contract — same as the Stage 1 handler. The parent /turn
// route ran safety gate, rate limit, ownership check, and user-
// message persistence; we trust those invariants.
// ---------------------------------------------------------------------------

export type Stage2HandlerArgs = {
  message:        string;
  history:        string;
  sessionId:      string;
  userId:         string;
  conversationId: string | null;
};

/**
 * Entry point for Stage 2 ('no_idea' + active stage 2) turns.
 *
 * Per-turn order:
 *   1. Load Stage 2 stage run + parse authoring state
 *   2. Load + parse the session's committed Stage 1 OutcomeDocument
 *   3. extractAndPlanStage2 → inputType + skillUpdates + teamMentions +
 *      agentMove + readyToCompose + driftDetected
 *   4. Resolve team-name mentions to add-or-existing operations
 *   5. Apply extractions + (move='recommend' → append action)
 *   6. Best-effort sync FounderProfile.skillInventory
 *   7. Dispatch:
 *        synthesis_request + ready  → derive (if needed) + compose
 *        synthesis_request + !ready → soft-close stream
 *        soft_close / drift          → soft-close stream
 *        ready + readyToCompose      → derive (if needed) + compose
 *        team-question gate trips    → stream the targeted question
 *        otherwise                   → stream the chosen move
 */
export async function handleStage2Turn(args: Stage2HandlerArgs): Promise<NextResponse> {
  const { message, history, sessionId, userId, conversationId } = args;
  const log = logger.child({ route: 'POST /api/discovery/sessions/[id]/turn', userId, sessionId, scenario: 'no_idea', stage: 2 });

  // ── 1. Load + parse Stage 2 run ─────────────────────────────────────────
  const stageRun = await getActiveStageRun(sessionId);
  if (!stageRun) throw new HttpError(500, 'Ideation stage run missing for no_idea session');
  if (stageRun.stageNumber !== 2) {
    // Dispatcher already routed; defensive.
    throw new HttpError(500, 'Dispatched wrong stage to Stage 2 handler');
  }
  if (stageRun.status !== 'authoring') {
    return NextResponse.json({
      error:       'Stage 2 is no longer authoring',
      stageStatus: stageRun.status,
      stageRunId:  stageRun.id,
    }, { status: 409 });
  }

  let state = safeParseStage2AuthoringState(stageRun.output);

  // ── 2. Load the committed Stage 1 OutcomeDocument ───────────────────────
  const outcomeDocument = await loadCommittedStage1Outcome(sessionId);
  if (!outcomeDocument) {
    throw new HttpError(500, 'Stage 1 OutcomeDocument missing or not committed');
  }

  // ── 3. Extract + plan ──────────────────────────────────────────────────
  const plan = await extractAndPlanStage2({
    founderMessage:      message,
    conversationHistory: history,
    state,
    outcomeDocument,
  });
  log.debug('Stage 2 extract+plan', {
    inputType:    plan.inputType,
    move:         plan.agentMove,
    skillUpdates: plan.skillUpdates.length,
    teamMentions: plan.teamMentions.length,
    drift:        plan.driftDetected,
    ready:        plan.readyToCompose,
  });

  // ── 4. Resolve team mentions → new teammate names (dedup vs existing) ──
  const existingNames = new Set(
    state.workingInventory.team
      .map(t => t.name?.toLowerCase().trim())
      .filter((n): n is string => !!n && n.length > 0),
  );
  const newTeammateNames: string[] = [];
  for (const t of plan.teamMentions) {
    const n = t.name.trim();
    if (n.length < 2) continue;
    const lc = n.toLowerCase();
    if (existingNames.has(lc)) continue;
    if (newTeammateNames.some(x => x.toLowerCase() === lc)) continue;
    newTeammateNames.push(n);
  }

  // ── 5. Resolve skill updates → SkillUpdate shape ───────────────────────
  const skillUpdates: SkillUpdate[] = [];
  for (const u of plan.skillUpdates) {
    if (u.person === 'founder') {
      skillUpdates.push({ person: 'founder', skill: u.skill, tier: u.tier });
      continue;
    }
    const lc = u.person.toLowerCase().trim();
    const existingIdx = state.workingInventory.team.findIndex(
      t => t.name?.toLowerCase().trim() === lc,
    );
    if (existingIdx >= 0) {
      skillUpdates.push({ person: existingIdx, skill: u.skill, tier: u.tier });
      continue;
    }
    // The LLM may have referenced a teammate it surfaced in the same
    // extraction — applyStage2Extractions adds new teammates BEFORE
    // applying updates, so the index will land at the tail.
    const newIdx = newTeammateNames.findIndex(n => n.toLowerCase() === lc);
    if (newIdx >= 0) {
      skillUpdates.push({
        person: state.workingInventory.team.length + newIdx,
        skill:  u.skill,
        tier:   u.tier,
      });
    }
    // else: orphaned reference — drop silently. The extractor's
    // teamMentions field is how the model surfaces new names; if it
    // referenced a name that's neither existing nor in teamMentions,
    // that's a model error and we'd rather drop than apply nonsense.
  }

  state = applyStage2Extractions(state, skillUpdates, newTeammateNames);

  if (plan.agentMove === 'recommend' && plan.recommendedAction) {
    state = appendStage2RecommendedAction(state, {
      action:          plan.recommendedAction.action,
      severity:        plan.recommendedAction.severity,
      raisedAt:        new Date().toISOString(),
      status:          'pending',
      founderResponse: null,
    });
  }

  // ── 6. Best-effort sync FounderProfile.skillInventory ──────────────────
  // The dedicated /skill-tier and /teammate routes do strict dual-
  // write inside a prisma.$transaction. Here the chat extraction
  // path is best-effort — if FounderProfile doesn't exist yet (first
  // cycle) the chat shouldn't block.
  await prisma.founderProfile.update({
    where: { userId },
    data:  { skillInventory: toJsonValue(state.workingInventory) },
  }).catch(() => undefined);

  // ── 7. Dispatch ────────────────────────────────────────────────────────
  const turnCount = parseHistory(history).filter(m => m.role === 'user').length + 1;
  const mechanicallyReady = computeStage2Readiness(state, turnCount);

  const fgShape = outcomeDocument.dimensions.financialGoal.value?.shape ?? null;
  const needsTeamQuestion =
    outcomeDemandsTeam({
      lifestylePreference: outcomeDocument.dimensions.lifestylePreference.value,
      financialGoalShape:  fgShape,
    })
    && state.workingInventory.team.length === 0
    && newTeammateNames.length === 0
    && !state.teamQuestionAsked
    && plan.inputType !== 'synthesis_request';

  // synthesis_request takes priority over team-question. If the
  // founder explicitly asked to wrap up, we either run the gate or
  // soft-close — never force a question after they said stop.
  if (plan.inputType === 'synthesis_request') {
    if (mechanicallyReady) {
      return runDeriveAndCompose({ stageRunId: stageRun.id, state, outcomeDocument, sessionId });
    }
    return streamMove({
      move:           'soft_close',
      state,
      outcomeDocument,
      message,
      history,
      stageRunId:     stageRun.id,
      conversationId,
    });
  }

  if (plan.agentMove === 'soft_close' || plan.driftDetected) {
    return streamMove({
      move:           'soft_close',
      state,
      outcomeDocument,
      message,
      history,
      stageRunId:     stageRun.id,
      conversationId,
    });
  }

  if (plan.readyToCompose && mechanicallyReady) {
    return runDeriveAndCompose({ stageRunId: stageRun.id, state, outcomeDocument, sessionId });
  }

  if (needsTeamQuestion) {
    const nextState = { ...state, teamQuestionAsked: true };
    await persistAuthoringState(stageRun.id, nextState);
    const result = streamTargetedTeamQuestion({
      state:               nextState,
      outcomeDocument,
      founderMessage:      message,
      conversationHistory: history,
    });
    return buildStreamResponse(result, conversationId, 'team_question');
  }

  return streamMove({
    move:               plan.agentMove,
    state,
    outcomeDocument,
    message,
    history,
    stageRunId:         stageRun.id,
    conversationId,
    recommendedAction:  plan.recommendedAction,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadCommittedStage1Outcome(sessionId: string): Promise<OutcomeDocument | null> {
  const stage1 = await prisma.ideationStageRun.findFirst({
    where:  { sessionId, stageNumber: 1, status: 'committed' },
    select: { output: true },
  });
  if (!stage1) return null;
  return safeParseOutcomeDocument(stage1.output);
}

async function runDeriveAndCompose(args: {
  stageRunId:      string;
  state:           Stage2AuthoringState;
  outcomeDocument: OutcomeDocument;
  sessionId:       string;
}): Promise<NextResponse> {
  const { stageRunId, state, outcomeDocument, sessionId } = args;

  // Persist accumulated extractions before derivation — even if
  // derivation fails (network, schema validation), the chat turn's
  // calibration is not lost.
  await persistAuthoringState(stageRunId, state);

  // Derive Expected Profile if not already done. Re-derives never
  // happen here — the explicit /derive-expected-profile route is the
  // path for that.
  let workingState = state;
  if (!workingState.workingExpectedProfile) {
    const derived = await deriveExpectedProfile({ outcomeDocument, contextId: sessionId });
    workingState = {
      ...workingState,
      workingExpectedProfile: derived.entries,
      researchLog:            derived.researchLog,
      requiresRederivation:   false,
    };
    await persistAuthoringState(stageRunId, workingState);
  }

  const doc = await composeRequirementsDocument({ state: workingState, outcomeDocument });
  await markStage2OutputReady(stageRunId, doc);

  return NextResponse.json({
    status:      'output_ready',
    stageRunId,
    stageNumber: 2,
  });
}

async function streamMove(args: {
  move:                Stage2AgentMove;
  state:               Stage2AuthoringState;
  outcomeDocument:     OutcomeDocument;
  message:             string;
  history:             string;
  stageRunId:          string;
  conversationId:      string | null;
  recommendedAction?:  { action: string; severity: 'suggested' | 'strongly_advised' } | null;
}): Promise<NextResponse> {
  const { move, state, outcomeDocument, message, history, stageRunId, conversationId, recommendedAction } = args;

  await persistAuthoringState(stageRunId, state);

  const result = streamStage2Message({
    move,
    state,
    outcomeDocument,
    founderMessage:      message,
    conversationHistory: history,
    recommendedAction:   recommendedAction ?? undefined,
  });

  return buildStreamResponse(result, conversationId, move);
}

async function buildStreamResponse(
  result:         FallbackStreamResult,
  conversationId: string | null,
  move:           Stage2AgentMove | 'team_question',
): Promise<NextResponse> {
  const initialAttrs: SpanAttrs =
    move === 'soft_close'
      ? { [ATTR_RESPONSE_TYPE]: 'soft_close' }
      : move === 'team_question'
        ? { [ATTR_RESPONSE_TYPE]: 'team_question' }
        : { [ATTR_GENERATION_TYPE]: 'question' };

  const observed = await withStreamingAgentSpan(
    { name: 'ideation.stage2.turn', attributes: initialAttrs },
    () => ({
      stream:    teeDiscoveryStream(result.textStream, conversationId, result.modelUsed),
      modelUsed: result.modelUsed,
      usage:     result.usagePromise,
    }),
  );

  const response = new NextResponse(observed);
  response.headers.set('Content-Type',  'text/plain; charset=utf-8');
  response.headers.set('X-Stage',       '2');
  response.headers.set('X-Stage-Move',  move);
  return response;
}
