// src/lib/ideation/stage4-opportunities/state.ts
//
// Stage 4 state machine — pure functions over Stage4AuthoringState
// and OpportunityEvaluation. Factories, safeParse helpers, simple
// mutators, readiness gate. Per-field clamps live in clamps.ts;
// aggregate-signal + chosen-#1 ranking live in aggregate.ts.

import 'server-only';
import {
  Stage4AuthoringStateSchema,
  OpportunityEvaluationsDocumentSchema,
  type OpportunityEvaluation,
  type Stage4AuthoringState,
  type OpportunityEvaluationsDocument,
  type CommunityResponse,
} from './schema';
import {
  MAX_RECOMMENDED_ACTIONS_STAGE4,
  MAX_RESPONSES_PER_OPPORTUNITY,
  MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT,
} from './constants';
import {
  clampOpportunity,
  clampResponse,
  clampAction,
  clampAuthoringState,
  clampDocument,
} from './clamps';
import type { OpportunityVerdict } from '@neuralaunch/constants';
import type { RecommendedAction } from '../stage1-outcome/schema';

// Re-export aggregate helpers + clamp primitives that callers reach
// for through this module. The internal split is a file-layout
// concern; the public surface stays flat.
export {
  computeAggregateSignal,
  evaluatedNotRejected,
  pickChosenOpportunity,
} from './aggregate';

// ---------------------------------------------------------------------------
// Empty-state factory
// ---------------------------------------------------------------------------

export function createEmptyStage4AuthoringState(): Stage4AuthoringState {
  return {
    opportunities:             [],
    founderCommunityResponses: [],
    recommendedActions:        [],
    researchLog:               [],
    cascadeSnapshot:            null,
    requiresRederivation:       false,
  };
}

// ---------------------------------------------------------------------------
// safeParse helpers — corrupt rows degrade gracefully
// ---------------------------------------------------------------------------

export function safeParseStage4AuthoringState(value: unknown): Stage4AuthoringState {
  const parsed = Stage4AuthoringStateSchema.safeParse(value ?? createEmptyStage4AuthoringState());
  if (parsed.success) return clampAuthoringState(parsed.data);
  return createEmptyStage4AuthoringState();
}

export function safeParseOpportunityEvaluationsDocument(value: unknown): OpportunityEvaluationsDocument | null {
  const parsed = OpportunityEvaluationsDocumentSchema.safeParse(value);
  if (!parsed.success) return null;
  return clampDocument(parsed.data);
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function freshId(prefix: 'oe' | 'cr'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Math.random fallback exists only for old Node test envs without
  // crypto.randomUUID; production never hits it (Node 19+ guarantees).
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function buildOpportunityEvaluation(input: {
  painPointId:      string;
  painPointSummary: string;
}): OpportunityEvaluation {
  return clampOpportunity({
    id:                    freshId('oe'),
    painPointId:           input.painPointId,
    painPointSummary:      input.painPointSummary,
    layerAResearch:        null,
    layerBScript:          null,
    layerBResponses:       [],
    layerBExtractedSignal: null,
    agentVerdict:          'pending',
    agentReasoning:        '',
    founderVerdict:        null,
    pushbackHistory:       [],
    pushbackVersion:       0,
    status:                'awaiting_research',
  });
}

export function buildCommunityResponse(input:
  | { opportunityId: string; source: 'text_paste'; pastedText: string }
  | { opportunityId: string; source: 'screenshot'; s3Url: string; s3Key: string }
): CommunityResponse {
  if (input.source === 'text_paste') {
    return clampResponse({
      id:               freshId('cr'),
      opportunityId:    input.opportunityId,
      source:           'text_paste',
      pastedText:       input.pastedText,
      s3Url:            null,
      s3Key:            null,
      uploadedAt:       new Date().toISOString(),
      extractedAt:      null,
      extractedSignal:  null,
      moderationPassed: true,
      moderationReason: null,
    });
  }
  return clampResponse({
    id:               freshId('cr'),
    opportunityId:    input.opportunityId,
    source:           'screenshot',
    pastedText:       null,
    s3Url:            input.s3Url,
    s3Key:            input.s3Key,
    uploadedAt:       new Date().toISOString(),
    extractedAt:      null,
    extractedSignal:  null,
    moderationPassed: false,
    moderationReason: null,
  });
}

// ---------------------------------------------------------------------------
// Simple mutators
// ---------------------------------------------------------------------------

export function appendOpportunity(s: Stage4AuthoringState, o: OpportunityEvaluation): Stage4AuthoringState {
  return { ...s, opportunities: [...s.opportunities, o] };
}

export function replaceOpportunityById(s: Stage4AuthoringState, id: string, next: OpportunityEvaluation): Stage4AuthoringState {
  return { ...s, opportunities: s.opportunities.map(o => o.id === id ? clampOpportunity(next) : o) };
}

export function removeOpportunityById(s: Stage4AuthoringState, id: string): Stage4AuthoringState {
  return {
    ...s,
    opportunities:             s.opportunities.filter(o => o.id !== id),
    founderCommunityResponses: s.founderCommunityResponses.filter(r => r.opportunityId !== id),
  };
}

/**
 * Append a community response to the pool. FIFO eviction at
 * MAX_RESPONSES_PER_OPPORTUNITY per opportunity — the oldest
 * response for that opp is dropped first.
 */
export function appendCommunityResponse(s: Stage4AuthoringState, r: CommunityResponse): Stage4AuthoringState {
  const clamped = clampResponse(r);
  const next = { ...s, founderCommunityResponses: [...s.founderCommunityResponses, clamped] };
  const oppResponses = next.founderCommunityResponses.filter(x => x.opportunityId === clamped.opportunityId);
  if (oppResponses.length > MAX_RESPONSES_PER_OPPORTUNITY) {
    const overflow = oppResponses.length - MAX_RESPONSES_PER_OPPORTUNITY;
    const idsToEvict = new Set(oppResponses.slice(0, overflow).map(x => x.id));
    return { ...next, founderCommunityResponses: next.founderCommunityResponses.filter(x => !idsToEvict.has(x.id)) };
  }
  return next;
}

export function replaceCommunityResponseById(s: Stage4AuthoringState, id: string, next: CommunityResponse): Stage4AuthoringState {
  return { ...s, founderCommunityResponses: s.founderCommunityResponses.map(r => r.id === id ? clampResponse(next) : r) };
}

export function removeCommunityResponseById(s: Stage4AuthoringState, id: string): Stage4AuthoringState {
  return { ...s, founderCommunityResponses: s.founderCommunityResponses.filter(r => r.id !== id) };
}

/**
 * Apply the agent's verdict + reasoning to an opportunity. Bumps
 * status to 'evaluated' so the readiness gate sees it.
 */
export function applyAgentVerdict(
  o: OpportunityEvaluation,
  verdict: OpportunityVerdict,
  reasoning: string,
): OpportunityEvaluation {
  return clampOpportunity({ ...o, agentVerdict: verdict, agentReasoning: reasoning, status: 'evaluated' });
}

/**
 * Apply the founder's final verdict. `drop` flips the status to
 * 'rejected_by_founder' so the row is excluded from chosen-#1
 * selection but kept in the audit trail.
 */
export function applyFounderVerdict(o: OpportunityEvaluation, verdict: OpportunityVerdict): OpportunityEvaluation {
  return clampOpportunity({
    ...o,
    founderVerdict: verdict,
    status:         verdict === 'drop' ? 'rejected_by_founder' : 'evaluated',
  });
}

/**
 * Append a Stage 4 recommended action. FIFO eviction + sticky-
 * completed merge — same shape as Stage 1/2/3.
 */
export function appendStage4RecommendedAction(s: Stage4AuthoringState, next: RecommendedAction): Stage4AuthoringState {
  const cleanedNext = clampAction(next);
  const key = cleanedNext.action.trim().toLowerCase();
  const existingIdx = s.recommendedActions.findIndex(a => a.action.trim().toLowerCase() === key);
  if (existingIdx >= 0) {
    const existing = s.recommendedActions[existingIdx];
    const merged: RecommendedAction = {
      ...existing,
      severity: (cleanedNext.severity === 'strongly_advised' || existing.severity === 'strongly_advised') ? 'strongly_advised' : 'suggested',
      status:   cleanedNext.status !== 'pending' ? cleanedNext.status : existing.status,
      founderResponse: cleanedNext.founderResponse ?? existing.founderResponse,
    };
    const list = s.recommendedActions.slice();
    list[existingIdx] = merged;
    return { ...s, recommendedActions: list };
  }
  const appended = [...s.recommendedActions, cleanedNext];
  if (appended.length <= MAX_RECOMMENDED_ACTIONS_STAGE4) {
    return { ...s, recommendedActions: appended };
  }
  const evictionIdx = appended.findIndex(a => a.status !== 'completed');
  const trimmed = appended.slice();
  trimmed.splice(evictionIdx >= 0 ? evictionIdx : 0, 1);
  return { ...s, recommendedActions: trimmed };
}

// ---------------------------------------------------------------------------
// Composition gate
// ---------------------------------------------------------------------------

/**
 * Single rule: at least MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT
 * opportunities have an explicit non-'drop' founder verdict. Below
 * this the composer refuses (no candidate to advance into Stage 5).
 */
export function computeStage4Readiness(s: Stage4AuthoringState): boolean {
  return s.opportunities.filter(
    o => o.status === 'evaluated' && o.founderVerdict !== null && o.founderVerdict !== 'drop',
  ).length >= MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT;
}

// ---------------------------------------------------------------------------
// Tiny lookup helpers — used by routes for existence checks before
// trusting a founder-supplied opportunityId.
// ---------------------------------------------------------------------------

export function allOpportunityIds(s: Stage4AuthoringState): string[] {
  return s.opportunities.map(o => o.id);
}
