// src/lib/ideation/stage3-opportunities/index.ts
//
// Public barrel for Stage 3 — Opportunity Identification. Client
// components must NOT import from this barrel; use the specific
// paths (schema.ts / constants.ts) to avoid pulling server-only
// modules into client bundles. See docs/stage3-handoff.md § 8.

// ---- Schemas + types ----
export type {
  ScorePushbackHistoryEntry,
  AgentSuggestedScores,
  FounderFinalScores,
  PainPoint,
  PainInventoryDocument,
  Stage3CascadeSnapshot,
  Stage3AuthoringState,
} from './schema';
export {
  ScorePushbackHistoryEntrySchema,
  AgentSuggestedScoresSchema,
  FounderFinalScoresSchema,
  PainPointSchema,
  PainInventoryDocumentSchema,
  Stage3CascadeSnapshotSchema,
  Stage3AuthoringStateSchema,
} from './schema';

// ---- Constants ----
export {
  MIN_PAIN_POINTS_FOR_COMMIT,
  SHORTLIST_TARGET,
  SHORTLIST_CAP,
  MAX_SCORE_PUSHBACK_ROUNDS,
  SCORE_PUSHBACK_SOFT_WARN_ROUND,
  SCORE_PUSHBACK_ROUND_MAX_TOKENS,
  MAX_SCOUT_RUNS,
  MAX_RECOMMENDED_ACTIONS_STAGE3,
  EVIDENCE_EXCERPT_MAX_CHARS,
  PAIN_INVENTORY_COMPOSITION_MAX_TOKENS,
} from './constants';

// ---- State machine + safe parsers ----
export type { NewPainPointInput } from './state';
export {
  createEmptyStage3AuthoringState,
  safeParseStage3AuthoringState,
  safeParsePainInventoryDocument,
  computeCombinedScore,
  applyFounderScores,
  buildPainPoint,
  appendPainPoint,
  removePainPointById,
  replacePainPointById,
  appendStage3RecommendedAction,
  allPainPoints,
  viableForShortlist,
  computeStage3Readiness,
} from './state';

// ---- Agent moves + prompts ----
export type { Stage3AgentMove } from './calibration-prompts';
export {
  STAGE3_SYSTEM_PROMPT,
  PROBE_SUFFIX,
  GROUND_SUFFIX,
  RECOMMEND_SUFFIX,
  SOFT_CLOSE_SUFFIX,
  SHORTLIST_INVITE_SUFFIX,
  suffixForMove,
  renderUpstreamContext,
  renderPainInventory,
  renderStableStage3Context,
} from './calibration-prompts';

// ---- Score pushback ----
// `RunPushbackRoundResult` is re-exported as
// `RunPainScorePushbackRoundResult` to avoid colliding with Stage 2's
// (Expected Profile) `RunPushbackRoundResult` at the top-level
// `@/lib/ideation` barrel.
export type {
  ScoreRefinement,
  ScoreReplacement,
  RunPushbackRoundResult as RunPainScorePushbackRoundResult,
} from './score-pushback';
export {
  runPainScorePushbackRound,
  applyScoreMutation,
  MAX_PAIN_SCORE_PUSHBACK_ROUNDS,
} from './score-pushback';

// ---- Extractor ----
export type { ExtractAndPlanStage3Result, ExtractAndPlanStage3Raw } from './extractor';
export {
  extractAndPlanStage3,
  narrowExtractAndPlanStage3Result,
} from './extractor';

// ---- Pain Scout agent ----
export type { RunPainScoutArgs, RunPainScoutResult } from './pain-scout-agent';
export { runPainScout } from './pain-scout-agent';

// ---- Composer ----
export { composePainInventoryDocument } from './composer';

// ---- Streaming agent ----
export { streamStage3Message } from './agent';
