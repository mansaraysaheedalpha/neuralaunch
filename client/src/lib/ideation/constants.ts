// src/lib/ideation/constants.ts
//
// Server-only constants for the No Idea archetype's ideation flow.
// Cross-app constants (enum value tuples) live in
// @neuralaunch/constants/ideation; this file holds the server-only
// thresholds, limits, and model identifiers.

// ---------------------------------------------------------------------------
// Confidence thresholds — Stage 1 outcome composition gate
// ---------------------------------------------------------------------------

/**
 * Minimum per-dimension confidence to count a Stage 1 outcome dimension
 * as "known". Mirrors MIN_FIELD_CONFIDENCE from the Discovery interview
 * engine so the founder-facing semantics ("the agent has enough on this
 * field") stay consistent.
 */
export const MIN_OUTCOME_FIELD_CONFIDENCE = 0.65;

/**
 * Mean confidence across the 4 outcome dimensions required before the
 * composer is allowed to fire. Strictly stronger than
 * MIN_OUTCOME_FIELD_CONFIDENCE because all four dims must clear the
 * floor AND the average must clear this ratio — so a row of "barely
 * 0.65" dimensions does not pass the gate.
 *
 * Used in `computeOutcomeReadiness(state)` — see state.ts.
 */
export const OUTCOME_READINESS_RATIO = 0.75;

// ---------------------------------------------------------------------------
// Drift detection — how long can the conversation circle before we
// surface a soft-close prompt to the founder?
// ---------------------------------------------------------------------------

/**
 * If this many Stage 1 turns pass without a new dimension reaching
 * MIN_OUTCOME_FIELD_CONFIDENCE, the extract-and-plan call is told to
 * consider drift seriously. The model returns `driftDetected: true`
 * when its own judgment aligns. On drift, the turn handler dispatches
 * a soft-close move that offers commit / pause / edit / keep going.
 *
 * Pure heuristic input — the LLM's final classification is what
 * actually drives the move, this just biases the extractor's signal.
 */
export const DRIFT_TURNS_THRESHOLD = 4;

// ---------------------------------------------------------------------------
// Recommended-actions log — bound the array on IdeationStageRun.output
// ---------------------------------------------------------------------------

/**
 * Cap on the size of `recommendedActions[]` inside Stage 1's output
 * JSON. The agent appends an entry when it decides on a `recommend`
 * move; capping at 25 leaves comfortable headroom for any realistic
 * Stage 1 conversation while bounding the JSONB column's growth so a
 * pathological session can't blow up the row size.
 *
 * When the cap is reached the oldest non-completed entries are
 * dropped first (FIFO), preserving the most recent advice the agent
 * has surfaced. Completed entries are sticky — they record what the
 * founder actually did and shouldn't roll off.
 */
export const MAX_RECOMMENDED_ACTIONS = 25;

// ---------------------------------------------------------------------------
// Model identifiers — Stage 1 reuses the Discovery interview chain
// ---------------------------------------------------------------------------

/**
 * Stage 1 piggybacks on the Discovery interview models — Sonnet for
 * primary, Haiku as the structured-call overload fallback, Gemini
 * Flash as the stream fallback (consumed via streamQuestionWithFallback
 * which builds its own chain).
 *
 * Composer (composeOutcomeDocument) uses Sonnet as well — Opus is
 * reserved for the cross-stage Stage 5 synthesis that doesn't exist
 * yet. Treat Stage 1 composition like a structured interview output:
 * Sonnet quality is sufficient, Opus latency is not worth it.
 */
export { MODELS } from '@/lib/discovery/constants';

// ---------------------------------------------------------------------------
// Composition output cap
// ---------------------------------------------------------------------------

/**
 * Max output tokens for the composer call. The OutcomeDocument is
 * short by design — a 3-5 sentence synthesis paragraph + a 2-3 sentence
 * rulesOut paragraph + a handful of recommendedActions entries. 1500
 * tokens is comfortable headroom.
 */
export const OUTCOME_COMPOSITION_MAX_TOKENS = 1500;

// ---------------------------------------------------------------------------
// Recommended-action raisedAt — bound stale entries
// ---------------------------------------------------------------------------

/**
 * The 4 Stage 1 dimensions, in display order. Centralised here so the
 * schema, state machine, composer prompt, and review UI all iterate
 * in the same order without depending on hash iteration.
 */
export const DIM_KEYS = [
  'timeHorizon',
  'financialGoal',
  'riskTolerance',
  'lifestylePreference',
] as const;
export type Stage1DimKey = typeof DIM_KEYS[number];
