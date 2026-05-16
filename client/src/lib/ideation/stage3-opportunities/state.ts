// src/lib/ideation/stage3-opportunities/state.ts
//
// Stage 3 state machine — pure functions over Stage3AuthoringState
// and PainPoint. Factories, safeParse helpers, mutation helpers,
// readiness gate, post-parse clamps for every numeric or string
// field that the LLM-output schema deliberately left unconstrained.

import 'server-only';
import {
  Stage3AuthoringStateSchema,
  PainInventoryDocumentSchema,
  type PainPoint,
  type Stage3AuthoringState,
  type PainInventoryDocument,
  type AgentSuggestedScores,
  type FounderFinalScores,
  type ScorePushbackHistoryEntry,
} from './schema';
import {
  MIN_PAIN_POINTS_FOR_COMMIT,
  MAX_RECOMMENDED_ACTIONS_STAGE3,
  EVIDENCE_EXCERPT_MAX_CHARS,
} from './constants';
import type { RecommendedAction } from '../stage1-outcome/schema';

// ---------------------------------------------------------------------------
// Empty-state factories
// ---------------------------------------------------------------------------

export function createEmptyStage3AuthoringState(): Stage3AuthoringState {
  return {
    agentPainPoints:      [],
    founderPainPoints:    [],
    recommendedActions:   [],
    researchLog:          [],
    scoutRunCount:        0,
    cascadeSnapshot:      null,
    requiresRederivation: false,
  };
}

// ---------------------------------------------------------------------------
// safeParse helpers — corrupt rows degrade gracefully
// ---------------------------------------------------------------------------

export function safeParseStage3AuthoringState(value: unknown): Stage3AuthoringState {
  const parsed = Stage3AuthoringStateSchema.safeParse(value ?? createEmptyStage3AuthoringState());
  if (parsed.success) return clampAuthoringState(parsed.data);
  return createEmptyStage3AuthoringState();
}

export function safeParsePainInventoryDocument(value: unknown): PainInventoryDocument | null {
  const parsed = PainInventoryDocumentSchema.safeParse(value);
  if (!parsed.success) return null;
  return clampDocument(parsed.data);
}

// ---------------------------------------------------------------------------
// Post-parse clamps
// ---------------------------------------------------------------------------

const DESCRIPTION_MAX_CHARS    = 600;
const FOUNDER_NOTES_MAX_CHARS  = 600;
const RELEVANCE_NOTE_MAX_CHARS = 300;
const COMMUNITY_ORIGIN_MAX_CHARS = 120;
const REASONING_MAX_CHARS      = 400;
const RULES_OUT_MAX_CHARS      = 800;
const PUSHBACK_MESSAGE_MAX_CHARS = 1500;
const ACTION_MAX_CHARS         = 200;
const FOUNDER_RESPONSE_MAX_CHARS = 400;

function clamp(str: string | null, max: number): string | null {
  if (str === null) return null;
  return str.length <= max ? str : str.slice(0, max).trimEnd();
}

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 1;
  if (n < 1) return 1;
  if (n > 5) return 5;
  return Math.round(n);
}

function clampAgentScores(s: AgentSuggestedScores | null): AgentSuggestedScores | null {
  if (s === null) return null;
  return {
    intensity:          clampScore(s.intensity),
    frequency:          clampScore(s.frequency),
    nicheSpecificity:   clampScore(s.nicheSpecificity),
    reasoningPerMetric: clamp(s.reasoningPerMetric, REASONING_MAX_CHARS) ?? '',
  };
}

function clampFounderScores(s: FounderFinalScores | null): FounderFinalScores | null {
  if (s === null) return null;
  return {
    intensity:        clampScore(s.intensity),
    frequency:        clampScore(s.frequency),
    nicheSpecificity: clampScore(s.nicheSpecificity),
  };
}

function clampPushbackEntry(e: ScorePushbackHistoryEntry): ScorePushbackHistoryEntry {
  return {
    ...e,
    founderMessage: clamp(e.founderMessage, PUSHBACK_MESSAGE_MAX_CHARS) ?? '',
    agentMessage:   clamp(e.agentMessage,   PUSHBACK_MESSAGE_MAX_CHARS) ?? '',
  };
}

function clampPainPoint(p: PainPoint): PainPoint {
  return {
    ...p,
    description:          clamp(p.description, DESCRIPTION_MAX_CHARS) ?? '',
    evidenceExcerpt:      clamp(p.evidenceExcerpt, EVIDENCE_EXCERPT_MAX_CHARS),
    communityOrigin:      clamp(p.communityOrigin, COMMUNITY_ORIGIN_MAX_CHARS),
    agentRelevanceNote:   clamp(p.agentRelevanceNote, RELEVANCE_NOTE_MAX_CHARS),
    founderNotes:         clamp(p.founderNotes, FOUNDER_NOTES_MAX_CHARS),
    agentSuggestedScores: clampAgentScores(p.agentSuggestedScores),
    founderFinalScores:   clampFounderScores(p.founderFinalScores),
    scorePushbackHistory: p.scorePushbackHistory.map(clampPushbackEntry),
  };
}

function clampAction(a: RecommendedAction): RecommendedAction {
  return {
    ...a,
    action:          clamp(a.action, ACTION_MAX_CHARS) ?? '',
    founderResponse: clamp(a.founderResponse, FOUNDER_RESPONSE_MAX_CHARS),
  };
}

function clampAuthoringState(s: Stage3AuthoringState): Stage3AuthoringState {
  return {
    ...s,
    agentPainPoints:    s.agentPainPoints.map(clampPainPoint),
    founderPainPoints:  s.founderPainPoints.map(clampPainPoint),
    recommendedActions: s.recommendedActions.map(clampAction),
    cascadeSnapshot:    s.cascadeSnapshot
      ? { ...s.cascadeSnapshot, document: clampDocument(s.cascadeSnapshot.document) }
      : null,
  };
}

function clampDocument(d: PainInventoryDocument): PainInventoryDocument {
  return {
    ...d,
    painPointsSnapshot: d.painPointsSnapshot.map(clampPainPoint),
    rulesOut:           clamp(d.rulesOut, RULES_OUT_MAX_CHARS) ?? '',
    recommendedActions: d.recommendedActions.map(clampAction),
  };
}

// ---------------------------------------------------------------------------
// Combined-score computation
// ---------------------------------------------------------------------------

/**
 * Per Troy's framework: combinedScore = intensity × frequency ×
 * nicheSpecificity. Multiplicative (not additive) so a pain point
 * that's intense but rare scores LOW as it should.
 *
 * Range: 1 (all 1s) to 125 (all 5s). Returns null when no founder
 * scores are set — the founder must rate before the pain point
 * counts toward shortlist composition.
 */
export function computeCombinedScore(scores: FounderFinalScores | null): number | null {
  if (scores === null) return null;
  return scores.intensity * scores.frequency * scores.nicheSpecificity;
}

/**
 * Apply scores + recompute combinedScore in one call. Used by
 * routes that update founderFinalScores.
 */
export function applyFounderScores(
  pp:     PainPoint,
  scores: FounderFinalScores,
): PainPoint {
  const clamped  = clampFounderScores(scores);
  return {
    ...pp,
    founderFinalScores: clamped,
    combinedScore:      computeCombinedScore(clamped),
    status:             'rated',
  };
}

// ---------------------------------------------------------------------------
// Pain-point append + remove + edit
// ---------------------------------------------------------------------------

export type NewPainPointInput =
  | {
      source:             'agent';
      description:        string;
      evidenceUrl:        string | null;
      evidenceExcerpt:    string | null;
      communityOrigin:    string | null;
      agentRelevanceNote: string | null;
      agentSuggestedScores: AgentSuggestedScores | null;
    }
  | {
      source:        'founder';
      description:   string;
      founderContext: PainPoint['founderContext'];
      founderNotes:  string | null;
    };

export function buildPainPoint(input: NewPainPointInput): PainPoint {
  const baseId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `pp_${Date.now()}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  // Math.random fallback exists only because old Node test envs
  // sometimes lack crypto.randomUUID; production never hits the
  // fallback (Node 19+ guarantees crypto.randomUUID).

  if (input.source === 'agent') {
    return clampPainPoint({
      id:                   baseId,
      description:          input.description,
      source:               'agent',
      evidenceUrl:          input.evidenceUrl,
      evidenceExcerpt:      input.evidenceExcerpt,
      communityOrigin:      input.communityOrigin,
      agentRelevanceNote:   input.agentRelevanceNote,
      founderContext:       null,
      founderNotes:         null,
      agentSuggestedScores: input.agentSuggestedScores,
      founderFinalScores:   null,
      combinedScore:        null,
      scorePushbackHistory: [],
      scorePushbackVersion: 0,
      status:               'pending_rating',
    });
  }
  return clampPainPoint({
    id:                   baseId,
    description:          input.description,
    source:               'founder',
    evidenceUrl:          null,
    evidenceExcerpt:      null,
    communityOrigin:      null,
    agentRelevanceNote:   null,
    founderContext:       input.founderContext,
    founderNotes:         input.founderNotes,
    agentSuggestedScores: null,
    founderFinalScores:   null,
    combinedScore:        null,
    scorePushbackHistory: [],
    scorePushbackVersion: 0,
    status:               'pending_rating',
  });
}

/**
 * Append a new pain point to the right side of the inventory (agent
 * or founder). Returns a new state; never mutates.
 */
export function appendPainPoint(
  state: Stage3AuthoringState,
  pp:    PainPoint,
): Stage3AuthoringState {
  if (pp.source === 'agent') {
    return { ...state, agentPainPoints: [...state.agentPainPoints, pp] };
  }
  return { ...state, founderPainPoints: [...state.founderPainPoints, pp] };
}

/**
 * Remove by id from whichever bucket it lives in. Useful for founder
 * rejection / agent re-scout.
 */
export function removePainPointById(
  state: Stage3AuthoringState,
  id:    string,
): Stage3AuthoringState {
  return {
    ...state,
    agentPainPoints:   state.agentPainPoints.filter(p => p.id !== id),
    founderPainPoints: state.founderPainPoints.filter(p => p.id !== id),
  };
}

/**
 * Replace a pain point by id (used by founder edit + pushback
 * write-through). Searches both buckets.
 */
export function replacePainPointById(
  state: Stage3AuthoringState,
  id:    string,
  next:  PainPoint,
): Stage3AuthoringState {
  const replace = (list: PainPoint[]) => list.map(p => (p.id === id ? clampPainPoint(next) : p));
  return {
    ...state,
    agentPainPoints:   replace(state.agentPainPoints),
    founderPainPoints: replace(state.founderPainPoints),
  };
}

// ---------------------------------------------------------------------------
// Recommended action — same FIFO + sticky-completed pattern as Stage 1/2
// ---------------------------------------------------------------------------

export function appendStage3RecommendedAction(
  state: Stage3AuthoringState,
  next:  RecommendedAction,
): Stage3AuthoringState {
  const cleanedNext = clampAction(next);
  const key = cleanedNext.action.trim().toLowerCase();

  const existingIdx = state.recommendedActions.findIndex(
    a => a.action.trim().toLowerCase() === key,
  );
  if (existingIdx >= 0) {
    const existing = state.recommendedActions[existingIdx];
    const mergedSeverity =
      cleanedNext.severity === 'strongly_advised' || existing.severity === 'strongly_advised'
        ? 'strongly_advised'
        : 'suggested';
    const merged: RecommendedAction = {
      ...existing,
      severity:        mergedSeverity,
      status:          cleanedNext.status !== 'pending' ? cleanedNext.status : existing.status,
      founderResponse: cleanedNext.founderResponse ?? existing.founderResponse,
    };
    const list = state.recommendedActions.slice();
    list[existingIdx] = merged;
    return { ...state, recommendedActions: list };
  }

  const appended = [...state.recommendedActions, cleanedNext];
  if (appended.length <= MAX_RECOMMENDED_ACTIONS_STAGE3) {
    return { ...state, recommendedActions: appended };
  }
  const evictionIdx = appended.findIndex(a => a.status !== 'completed');
  const trimmed = appended.slice();
  trimmed.splice(evictionIdx >= 0 ? evictionIdx : 0, 1);
  return { ...state, recommendedActions: trimmed };
}

// ---------------------------------------------------------------------------
// Composition gate
// ---------------------------------------------------------------------------

/**
 * Combined inventory across both buckets. Used by the composer + the
 * readiness gate.
 */
export function allPainPoints(state: Stage3AuthoringState): PainPoint[] {
  return [...state.agentPainPoints, ...state.founderPainPoints];
}

/**
 * Pain points that count toward the shortlist:
 *   - status === 'rated' (founder has set founderFinalScores)
 *   - founderFinalScores is non-null
 *   - combinedScore is non-null
 *
 * 'pending_rating' and 'rejected_by_founder' are excluded.
 */
export function viableForShortlist(state: Stage3AuthoringState): PainPoint[] {
  return allPainPoints(state).filter(
    p =>
      p.status === 'rated'
      && p.founderFinalScores !== null
      && p.combinedScore !== null,
  );
}

/**
 * Returns true when the composer is allowed to fire. Single rule:
 * at least MIN_PAIN_POINTS_FOR_COMMIT (3) viable rated pain points.
 *
 * The Pain Scout agent's `readyToCompose` self-assessment is the
 * *signal*; this function is the *gate*. Composition fires only
 * when both agree.
 */
export function computeStage3Readiness(state: Stage3AuthoringState): boolean {
  return viableForShortlist(state).length >= MIN_PAIN_POINTS_FOR_COMMIT;
}

// ---------------------------------------------------------------------------
// Test-only export
// ---------------------------------------------------------------------------

export const __testInternals = {
  clampScore,
  clamp,
  clampPainPoint,
  clampDocument,
};
