// src/lib/ideation/stage5-handoff/composer.ts
//
// Composes the Stage5HandoffDocument from the authoring state.
// Unlike Stage 3 / Stage 4 composers, this one has NO LLM call —
// the heavy lifting (synthesizing a Recommendation from Stage 4
// context) happens in synthesis-bridge.ts ahead of composition.
// By the time the composer fires, the Recommendation row already
// exists in the database; the handoff document is a thin
// reference-bundle record.
//
// The composer's job:
//   1. Verify readiness (synthesis must have completed)
//   2. Verify the chosen + reserve snapshots survived authoring
//   3. Stamp composedAt
//   4. Round-trip through safeParse so clamps fire

import 'server-only';
import { safeParseStage5HandoffDocument } from './state';
import type {
  Stage5AuthoringState,
  Stage5HandoffDocument,
} from './schema';

/**
 * Compose the Stage 5 handoff document from the authoring state.
 * Throws when the authoring state is not ready — caller (the turn
 * handler's compose path) gates on computeStage5Readiness first.
 *
 * Pure function — no DB access, no LLM call. The synthesize-
 * recommendation route already persisted the Recommendation row
 * and stamped synthesizedRecommendationId onto authoring; this
 * helper only freezes the snapshot into the output column.
 */
export function composeStage5HandoffDocument(args: {
  state: Stage5AuthoringState;
}): Stage5HandoffDocument {
  const { state } = args;

  // ── Pre-checks ────────────────────────────────────────────────────────
  if (state.chosenOpportunity === null) {
    throw new Error('Cannot compose: no chosen opportunity seeded on authoring state.');
  }
  if (state.synthesisStatus !== 'synthesized' || state.synthesizedRecommendationId === null) {
    throw new Error(
      `Cannot compose: synthesis not complete (status=${state.synthesisStatus}, ` +
      `recommendationId=${state.synthesizedRecommendationId ?? 'null'}).`,
    );
  }

  // ── Assemble + round-trip through safeParse to apply clamps ───────────
  const candidate: Stage5HandoffDocument = {
    chosenOpportunity:           state.chosenOpportunity,
    reserveOpportunities:        state.reserveOpportunities,
    synthesizedRecommendationId: state.synthesizedRecommendationId,
    recommendedActions:          state.recommendedActions,
    composedAt:                  new Date().toISOString(),
  };

  const parsed = safeParseStage5HandoffDocument(candidate);
  if (!parsed) {
    throw new Error('Composer produced a document that failed Stage5HandoffDocument validation');
  }
  return parsed;
}
