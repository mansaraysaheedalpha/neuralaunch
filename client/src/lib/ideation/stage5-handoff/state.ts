// src/lib/ideation/stage5-handoff/state.ts
//
// Stage 5 state machine — pure functions over Stage5AuthoringState
// and Stage5HandoffDocument. Empty-state factory, safeParse helpers,
// synthesis-result application, readiness gate. Per-field clamps
// live in clamps.ts (split out to keep this file under the brief's
// 200-line cap).

import 'server-only';
import {
  Stage5AuthoringStateSchema,
  Stage5HandoffDocumentSchema,
  type Stage5AuthoringState,
  type Stage5HandoffDocument,
  type ChosenOpportunitySnapshot,
  type ReserveOpportunity,
} from './schema';
import type { RecommendedAction } from '../stage1-outcome/schema';
import { MAX_RECOMMENDED_ACTIONS_STAGE5 } from './constants';
import {
  clampAction,
  clampAuthoringState,
  clampDocument,
} from './clamps';

// ---------------------------------------------------------------------------
// Empty-state factory + safe parsers
// ---------------------------------------------------------------------------

export function createEmptyStage5AuthoringState(): Stage5AuthoringState {
  return {
    chosenOpportunity:           null,
    reserveOpportunities:        [],
    synthesizedRecommendationId: null,
    synthesisStatus:             'awaiting_synthesis',
    synthesisError:              null,
    recommendedActions:          [],
    cascadeSnapshot:             null,
    requiresRederivation:        false,
  };
}

export function safeParseStage5AuthoringState(value: unknown): Stage5AuthoringState {
  const parsed = Stage5AuthoringStateSchema.safeParse(value ?? createEmptyStage5AuthoringState());
  if (parsed.success) return clampAuthoringState(parsed.data);
  return createEmptyStage5AuthoringState();
}

export function safeParseStage5HandoffDocument(value: unknown): Stage5HandoffDocument | null {
  const parsed = Stage5HandoffDocumentSchema.safeParse(value);
  if (!parsed.success) return null;
  return clampDocument(parsed.data);
}

// ---------------------------------------------------------------------------
// Mutators
// ---------------------------------------------------------------------------

/**
 * Seed the authoring state with the Stage 4 handoff context. Called
 * by the Stage 5 dispatch path on first entry (no chosen yet).
 * Idempotent — calling twice with the same chosen overwrites.
 */
export function seedStage5Authoring(
  s:        Stage5AuthoringState,
  chosen:   ChosenOpportunitySnapshot,
  reserves: ReserveOpportunity[],
): Stage5AuthoringState {
  return clampAuthoringState({
    ...s,
    chosenOpportunity:    chosen,
    reserveOpportunities: reserves,
  });
}

/**
 * Apply the synthesize-recommendation route's result onto the
 * authoring state. Moves synthesisStatus to 'synthesized' and records
 * the Recommendation row id.
 */
export function applySynthesisResult(
  s:                Stage5AuthoringState,
  recommendationId: string,
): Stage5AuthoringState {
  return clampAuthoringState({
    ...s,
    synthesizedRecommendationId: recommendationId,
    synthesisStatus:             'synthesized',
    synthesisError:              null,
  });
}

/**
 * Apply a synthesis failure. Caller passes a short reason string the
 * UI surfaces; founder re-fires from the canvas.
 */
export function applySynthesisFailure(
  s:      Stage5AuthoringState,
  reason: string,
): Stage5AuthoringState {
  return clampAuthoringState({
    ...s,
    synthesizedRecommendationId: null,
    synthesisStatus:             'synthesis_failed',
    synthesisError:              reason,
  });
}

/**
 * Append a Stage 5 recommended action. FIFO eviction + sticky-completed
 * merge — same shape as Stage 1/2/3/4.
 */
export function appendStage5RecommendedAction(
  s:    Stage5AuthoringState,
  next: RecommendedAction,
): Stage5AuthoringState {
  const cleaned = clampAction(next);
  const key = cleaned.action.trim().toLowerCase();
  const existingIdx = s.recommendedActions.findIndex(a => a.action.trim().toLowerCase() === key);
  if (existingIdx >= 0) {
    const existing = s.recommendedActions[existingIdx];
    const merged: RecommendedAction = {
      ...existing,
      severity:        (cleaned.severity === 'strongly_advised' || existing.severity === 'strongly_advised') ? 'strongly_advised' : 'suggested',
      status:          cleaned.status !== 'pending' ? cleaned.status : existing.status,
      founderResponse: cleaned.founderResponse ?? existing.founderResponse,
    };
    const list = s.recommendedActions.slice();
    list[existingIdx] = merged;
    return { ...s, recommendedActions: list };
  }
  const appended = [...s.recommendedActions, cleaned];
  if (appended.length <= MAX_RECOMMENDED_ACTIONS_STAGE5) {
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
 * Single rule: synthesis must have completed AND a chosen opportunity
 * exists. Below this the composer refuses to fire (no Recommendation
 * to hand off).
 *
 * The Stage 5 chat handler also gates compose_invite on this signal.
 */
export function computeStage5Readiness(s: Stage5AuthoringState): boolean {
  return s.synthesisStatus === 'synthesized'
      && s.synthesizedRecommendationId !== null
      && s.chosenOpportunity !== null;
}
