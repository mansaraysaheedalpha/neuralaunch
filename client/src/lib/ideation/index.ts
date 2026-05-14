// src/lib/ideation/index.ts
//
// Public API for the ideation module. Nothing outside this directory
// should import from internal files — those are implementation detail.

// ---- Schemas + inferred types ----
export type {
  OutcomeDimensions,
  RecommendedAction,
  OutcomeDocument,
  Stage1AuthoringState,
  PriorCommittedSnapshot,
} from './stage1-outcome/schema';
export {
  OutcomeDimensionsSchema,
  RecommendedActionSchema,
  OutcomeDocumentSchema,
  Stage1AuthoringStateSchema,
  PriorCommittedSnapshotSchema,
} from './stage1-outcome/schema';

// ---- Constants ----
export {
  MIN_OUTCOME_FIELD_CONFIDENCE,
  OUTCOME_READINESS_RATIO,
  DRIFT_TURNS_THRESHOLD,
  MAX_RECOMMENDED_ACTIONS,
  OUTCOME_COMPOSITION_MAX_TOKENS,
  DIM_KEYS,
  MODELS,
} from './constants';
export type { Stage1DimKey } from './constants';

// ---- State machine + safe parsers ----
export type { Stage1Extraction } from './stage1-outcome/state';
export {
  createEmptyDimensions,
  createEmptyStage1AuthoringState,
  safeParseStage1AuthoringState,
  safeParseOutcomeDocument,
  applyExtractions,
  appendRecommendedAction,
  computeOutcomeReadiness,
} from './stage1-outcome/state';

// ---- Persistence ----
export type { StageStatus } from './stage-run-store';
export {
  STAGE_RUN_SELECT,
  createInitialStageRunsForNoIdea,
  getActiveStageRun,
  requireOwnedStageRun,
  persistAuthoringState,
  // Stage 1 transitions
  markStage1OutputReady,
  markStage1Committed,
  revertToEdit,
  restoreFromEditSnapshot,
  // Stage 2 transitions
  markStage2OutputReady,
  markStage2Committed,
  updateSkillTier,
  updateTeammate,
  setStructuralBlockerChoice,
  writeWorkingExpectedProfile,
  writeExpectedProfileEntry,
  // Cross-stage cascades
  cascadeStage1EditToStage2,
  restoreStage2FromCascadeSnapshot,
  clearStage2CascadeSnapshot,
} from './stage-run-store';

// ---- Agent (streaming) ----
export type { AgentMove } from './stage1-outcome/reality-grounding';
export {
  streamStage1Message,
  streamStage1Opening,
  streamStage1EditProbe,
} from './stage1-outcome/agent';

// ---- Extractor (structured) ----
export type { ExtractAndPlanResult, Stage1InputType } from './stage1-outcome/extractor';
export { extractAndPlan } from './stage1-outcome/extractor';

// ---- Composer ----
export { composeOutcomeDocument } from './stage1-outcome/composer';

// ===========================================================================
// Stage 2 — Outcome Requirements
// ===========================================================================
//
// Stage 2's public surface is re-exported from its sub-module barrel
// at './stage2-requirements'. Importers that prefer a more specific
// path can also reach it as `@/lib/ideation/stage2-requirements`.

export * from './stage2-requirements';
