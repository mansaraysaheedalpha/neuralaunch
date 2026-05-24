// src/lib/ideation/stage5-handoff/index.ts
//
// Public barrel for Stage 5 — Validation Handoff. The bridge to the
// legacy post-Discovery pipeline. Client components MUST NOT import
// from this barrel (same discipline as Stage 3/4) — use the specific
// schema.ts / constants.ts paths to keep server-only modules out of
// client bundles.

// ---- Schemas + types ----
export type {
  ReserveLayerASummary,
  ReserveLayerBSummary,
  ReserveOpportunity,
  ChosenOpportunitySnapshot,
  SynthesisStatus,
  Stage5HandoffDocument,
  Stage5CascadeSnapshot,
  Stage5AuthoringState,
} from './schema';
export {
  ReserveOpportunitySchema,
  ChosenOpportunitySnapshotSchema,
  Stage5HandoffDocumentSchema,
  Stage5CascadeSnapshotSchema,
  Stage5AuthoringStateSchema,
  SYNTHESIS_STATUSES,
} from './schema';

// ---- Constants ----
export {
  MAX_RESERVE_OPPORTUNITIES,
  MAX_RECOMMENDED_ACTIONS_STAGE5,
  STAGE5_SYNTHESIS_RESEARCH_STEPS,
  STAGE5_REASONING_MAX_TOKENS,
  STAGE5_EMIT_MAX_TOKENS,
} from './constants';

// ---- State machine ----
export {
  createEmptyStage5AuthoringState,
  safeParseStage5AuthoringState,
  safeParseStage5HandoffDocument,
  seedStage5Authoring,
  applySynthesisResult,
  applySynthesisFailure,
  appendStage5RecommendedAction,
  computeStage5Readiness,
} from './state';

// ---- Reserve builder ----
export { buildReserveOpportunities } from './reserve-builder';

// ---- Composer ----
export { composeStage5HandoffDocument } from './composer';

// ---- Synthesis bridge ----
export { renderFounderSummary }                from './render-founder-summary';
export type { RenderFounderSummaryArgs }       from './render-founder-summary';
export { renderStrategicAnalysis }             from './render-strategic-analysis';
export type { RenderStrategicAnalysisArgs }    from './render-strategic-analysis';
export { runStage5SynthesisBridge }            from './synthesis-bridge';
export type { RunStage5SynthesisBridgeArgs }   from './synthesis-bridge';

// ---- Durable job (IdeationStage5Job) ----
//
// Server-only helpers live in ./job (import 'server-only'); they re-
// export through the barrel so the synthesize route + worker can keep
// imports flat. Client components must not reach in (the barrel is
// already off-limits per the discipline noted at the top of this file).
export {
  STAGE5_JOB_STAGES,
  STAGE5_TERMINAL_STAGES,
  Stage5JobStatusSchema,
  createStage5Job,
  findOpenStage5Job,
  updateStage5JobStage,
  succeedStage5Job,
  failStage5Job,
} from './job';
export type { Stage5JobStage, Stage5JobStatus } from './job';
