// src/lib/ideation/stage5-handoff/constants.ts
//
// Server-only constants for Stage 5 — Validation Handoff. Cross-app
// enum value lists live in @neuralaunch/constants/ideation; this file
// holds the thresholds, limits, and caps that are server-side
// concerns.

// ---- Reserves --------------------------------------------------------------

/**
 * Hard cap on the reserves array. Stage 4's shortlist cap is 5 (one
 * chosen + four reserves), so this matches by construction. The
 * continuation brief surfaces these as forks; bounded shape keeps
 * the brief's rendering predictable.
 */
export const MAX_RESERVE_OPPORTUNITIES = 4;

// ---- Synthesis bridge ------------------------------------------------------

/**
 * Per-call research-step budget for the Phase 1A reasoning pass in
 * the Stage 5 synthesis bridge. Mirrors the legacy
 * RESEARCH_BUDGETS.recommendation budget (commit #2 reuses
 * runFinalSynthesis directly, which reads from the legacy
 * 'recommendation' agent budget). Defined here for documentation
 * + future divergence if Stage 5 needs its own budget.
 */
export const STAGE5_SYNTHESIS_RESEARCH_STEPS = 8;

/**
 * Max output tokens for the Phase 1A reasoning pass (Opus, free-form
 * text covering every Recommendation field). Same generous budget as
 * the legacy runFinalSynthesis — the reasoning step is the most
 * expensive call in the bridge but produces the highest-leverage
 * artifact.
 */
export const STAGE5_REASONING_MAX_TOKENS = 16_384;

/**
 * Max output tokens for the Phase 1B structured-emission pass
 * (Sonnet, no tools, Output.object → RecommendationSchema).
 */
export const STAGE5_EMIT_MAX_TOKENS = 16_384;

// ---- Composition output ----------------------------------------------------

/**
 * Founder-action recommendation log cap — FIFO eviction once we hit
 * this number. Same shape as Stage 1-4 MAX_RECOMMENDED_ACTIONS,
 * scoped per stage.
 */
export const MAX_RECOMMENDED_ACTIONS_STAGE5 = 25;

// ---- Models ---------------------------------------------------------------
//
// Same MODELS table Stages 1-4 use. Stage 5's synthesis bridge
// delegates to runFinalSynthesis (synthesis-final.ts), which selects
// Opus for Phase 1A reasoning and Sonnet for Phase 1B emit — same
// model choices the legacy Discovery synthesis uses.

export { MODELS } from '@/lib/discovery/constants';
