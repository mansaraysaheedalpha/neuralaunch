// src/lib/ideation/stage4-opportunities/index.ts
//
// Public barrel for Stage 4 — Opportunity Evaluation & Research.
// Client components must NOT import from this barrel; they import
// directly from `./schema` or `./constants` to avoid pulling
// server-only modules into the client bundle (same discipline as
// Stage 3 — see docs/stage3-handoff.md § 8).

// ---- Schemas + types ----
export type {
  Citation,
  DimensionFinding,
  LayerAResearch,
  LayerBScript,
  CommunityComment,
  ExtractedSignal,
  CommunityResponse,
  LayerBExtractedSignal,
  OpportunityPushbackHistoryEntry,
  OpportunityEvaluation,
  OpportunityEvaluationsDocument,
  Stage4CascadeSnapshot,
  Stage4AuthoringState,
} from './schema';
export {
  CitationSchema,
  DimensionFindingSchema,
  LayerAResearchSchema,
  LayerBScriptSchema,
  CommunityCommentSchema,
  ExtractedSignalSchema,
  CommunityResponseSchema,
  LayerBExtractedSignalSchema,
  OpportunityPushbackHistoryEntrySchema,
  OpportunityEvaluationSchema,
  OpportunityEvaluationsDocumentSchema,
  Stage4CascadeSnapshotSchema,
  Stage4AuthoringStateSchema,
} from './schema';

// ---- Constants ----
export {
  MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT,
  MAX_OPPORTUNITIES_PER_STAGE,
  STAGE4_LAYER_A_RESEARCH_STEPS,
  LAYER_A_DIMENSION_MAX_TOKENS,
  LAYER_A_DIMENSIONS,
  LAYER_B_SCRIPT_MAX_TOKENS,
  MAX_RESPONSES_PER_OPPORTUNITY,
  MAX_SCREENSHOT_BYTES,
  ALLOWED_SCREENSHOT_CONTENT_TYPES,
  COMMUNITY_COMMENT_EXCERPT_MAX_CHARS,
  MAX_VERDICT_PUSHBACK_ROUNDS,
  VERDICT_PUSHBACK_SOFT_WARN_ROUND,
  VERDICT_PUSHBACK_ROUND_MAX_TOKENS,
  VISION_EXTRACTION_MAX_TOKENS,
  VISION_MODERATION_MAX_TOKENS,
  OPPORTUNITY_DOCUMENT_COMPOSITION_MAX_TOKENS,
  MAX_RECOMMENDED_ACTIONS_STAGE4,
} from './constants';
export type { LayerADimensionKey, AllowedScreenshotContentType } from './constants';

// ---- State machine + safe parsers + factories ----
export {
  createEmptyStage4AuthoringState,
  safeParseStage4AuthoringState,
  safeParseOpportunityEvaluationsDocument,
  buildOpportunityEvaluation,
  buildCommunityResponse,
  appendOpportunity,
  replaceOpportunityById,
  removeOpportunityById,
  appendCommunityResponse,
  replaceCommunityResponseById,
  removeCommunityResponseById,
  applyAgentVerdict,
  applyFounderVerdict,
  appendStage4RecommendedAction,
  computeStage4Readiness,
  allOpportunityIds,
  // Re-exported from aggregate via state.ts:
  computeAggregateSignal,
  evaluatedNotRejected,
  pickChosenOpportunity,
} from './state';

// ---- Vision pipeline ----
export {
  runModerationGate,
  extractSignal,
  type ModerationResult,
  type ExtractArgs,
} from './vision-extractor';

// ---- Composer ----
export { composeOpportunityEvaluationsDocument } from './composer';

// ---- Layer A research agent ----
export { runLayerAResearch, type RunLayerAArgs, type RunLayerAResult } from './layer-a-research-agent';

// ---- Layer B test-script generator ----
export { runLayerBScript, type RunLayerBArgs } from './layer-b-script-agent';

// ---- Verdict synthesizer ----
export { synthesizeVerdict, type SynthesizeArgs, type SynthesizeResult } from './verdict-synthesizer';

// ---- Verdict pushback engine ----
export {
  runVerdictPushbackRound,
  applyVerdictMutation,
  MAX_OPPORTUNITY_PUSHBACK_ROUNDS,
  type RunVerdictPushbackArgs,
  type RunVerdictPushbackResult,
} from './verdict-pushback';

// ---- Community-response pipeline ----
export {
  runCommunityResponsePipeline,
  type CommunityResponseInput,
  type CommunityResponsePipelineResult,
} from './community-response-pipeline';

// ---- Chat: extractor + streaming agent (public API) ----
//
// The per-move suffix constants + renderers in calibration-prompts.ts
// are deliberately NOT re-exported here. They collide with Stage 3's
// same-named exports (PROBE_SUFFIX, GROUND_SUFFIX, etc.) under the
// top-level barrel's `export *`. Callers inside this module reach
// them via relative imports; the turn handler only needs the public
// surface below.
export type { Stage4AgentMove } from './calibration-prompts';
export {
  extractAndPlanStage4,
  narrowExtractAndPlanStage4Result,
  type ExtractAndPlanStage4Result,
  type ExtractAndPlanStage4Raw,
} from './extractor';
export { streamStage4Message } from './agent';
