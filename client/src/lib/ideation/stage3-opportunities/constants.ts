// src/lib/ideation/stage3-opportunities/constants.ts
//
// Server-only constants for Stage 3 — Opportunity Identification.
// Cross-app constants (enum value tuples) live in
// @neuralaunch/constants/ideation; this file holds the thresholds,
// limits, and caps that are server-side concerns.

// ---------------------------------------------------------------------------
// Shortlist composition gate
// ---------------------------------------------------------------------------

/**
 * Below this number of rated viable pain points, the founder cannot
 * commit the document — the agent surfaces a soft-block and nudges
 * them toward more scouting (re-run Pain Scout + Human Scout
 * additions). Drawn from the brief: "Below floor of 3 viable scored
 * pain points, the commit affordance is disabled."
 */
export const MIN_PAIN_POINTS_FOR_COMMIT = 3;

/**
 * Target shortlist size. The composer aims for this; if more than
 * this many viable rated pain points exist, the composer ranks and
 * picks the top SHORTLIST_TARGET.
 */
export const SHORTLIST_TARGET = 5;

/**
 * Hard cap on shortlist size — never advance more than this to
 * Stage 4. Reason: Stage 4's research budget per-opportunity gets
 * expensive, so we hold the line at 5 even if more pain points
 * scored highly.
 */
export const SHORTLIST_CAP = 5;

// ---------------------------------------------------------------------------
// Score-pushback engine — mirrors Stage 2's expected-profile-pushback
// ---------------------------------------------------------------------------

/**
 * Hard round cap per pain point. Same value as Stage 2's pushback:
 * Expected Profile entries and pain-point scores are similar-sized
 * surfaces, so the 5-round ceiling carries over.
 */
export const MAX_SCORE_PUSHBACK_ROUNDS = 5;

/**
 * Soft-warn round — at this round count the agent considers closing
 * the conversation if it's not converging. Mirrors Stage 2's
 * EXPECTED_PROFILE_PUSHBACK_SOFT_WARN_ROUND.
 */
export const SCORE_PUSHBACK_SOFT_WARN_ROUND = 3;

/**
 * Max output tokens for one pushback round (reasoning + emit
 * together). Same ceiling as Stage 2's per-round budget.
 */
export const SCORE_PUSHBACK_ROUND_MAX_TOKENS = 1200;

// ---------------------------------------------------------------------------
// Pain Scout — agent budget + per-session limits
// ---------------------------------------------------------------------------

/**
 * Max number of Pain Scout re-runs per Stage 3 session. Each run is
 * an Opus + tool-loop call against the RESEARCH_BUDGETS['stage3-pain-
 * scout'] step budget (8 steps); capping the per-session count
 * prevents a founder from running the agent indefinitely against the
 * same input.
 *
 * Hit the cap → the route returns 429 with a clear message; the
 * founder must commit or refine their question.
 */
export const MAX_SCOUT_RUNS = 5;

/**
 * Founder-action recommendation log cap — FIFO eviction once we hit
 * this number. Same shape as Stage 1's MAX_RECOMMENDED_ACTIONS,
 * scoped per stage.
 */
export const MAX_RECOMMENDED_ACTIONS_STAGE3 = 25;

// ---------------------------------------------------------------------------
// Evidence excerpt — PII contract
// ---------------------------------------------------------------------------

/**
 * Hard cap on the per-pain-point `evidenceExcerpt` field. Mirrors
 * the same cap enforced in `lib/research/free-composite/normalize.ts`
 * (EXCERPT_MAX_CHARS). Two clamps protect against bypass via
 * non-Pain-Scout sources (founder-supplied URL with snippet).
 *
 * Load-bearing — see lib/research/free-composite/README.md
 * § "PII handling".
 */
export const EVIDENCE_EXCERPT_MAX_CHARS = 280;

// ---------------------------------------------------------------------------
// Composition output cap
// ---------------------------------------------------------------------------

/**
 * Max output tokens for the composer's `rulesOut` prose pass. The
 * shortlist itself is deterministic (id list); the LLM only writes
 * the "why these 5 and not others" prose.
 */
export const PAIN_INVENTORY_COMPOSITION_MAX_TOKENS = 800;

// ---------------------------------------------------------------------------
// Model identifiers — Stage 3 reuses Discovery's interview chain
// ---------------------------------------------------------------------------

/**
 * Same MODELS table Stages 1 and 2 use. Pain Scout uses Sonnet for
 * the tool-loop, Opus for score-pushback reasoning + composer's
 * rulesOut prose (matches Stage 2's Opus-reasoning → Sonnet-emit
 * pattern).
 */
export { MODELS } from '@/lib/discovery/constants';
