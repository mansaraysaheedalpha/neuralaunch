// src/lib/ideation/stage2-requirements/index.ts
//
// Public API for the Stage 2 (Outcome Requirements) module. Nothing
// outside this directory should import from internal files — those
// are implementation detail. Top-level `@/lib/ideation` re-exports
// the public surface listed here.

// ---- Schemas + inferred types ----
export type {
  PersonSkills,
  SkillInventory,
  ExpectedProfileEntry,
  ExpectedProfilePushbackState,
  ExpectedProfilePushbackHistoryEntry,
  Constraint,
  StructuralBlocker,
  RequirementsDocument,
  Stage2AuthoringState,
  Stage2CascadeSnapshot,
} from './schema';
export {
  PersonSkillsSchema,
  SkillInventorySchema,
  ExpectedProfileEntrySchema,
  ExpectedProfilePushbackStateSchema,
  ExpectedProfilePushbackHistoryEntrySchema,
  ConstraintSchema,
  StructuralBlockerSchema,
  RequirementsDocumentSchema,
  Stage2AuthoringStateSchema,
  Stage2CascadeSnapshotSchema,
  SkillKeySchema,
  SkillTierSchema,
  GapSeveritySchema,
  StructuralBlockerChoiceSchema,
  ExpectedProfilePushbackActionSchema,
  ExpectedProfilePushbackModeSchema,
} from './schema';

// ---- Constants ----
export {
  MIN_SKILL_CALIBRATION_TURNS,
  MAX_RECOMMENDED_ACTIONS_STAGE2,
  STRUCTURAL_BLOCKER_THRESHOLD,
  EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND,
  EXPECTED_PROFILE_PUSHBACK_SOFT_WARN_ROUND,
  EXPECTED_PROFILE_RESEARCH_AGENT_KEY,
  REQUIREMENTS_COMPOSITION_MAX_TOKENS,
  EXPECTED_PROFILE_MAX_TOKENS,
  EXPECTED_PROFILE_PUSHBACK_ROUND_MAX_TOKENS,
  TIER_ORDER,
  outcomeDemandsTeam,
} from './constants';

// ---- State machine + safe parsers ----
export type { SkillUpdate, TeammateOp } from './state';
export {
  createEmptyPersonSkills,
  createEmptySkillInventory,
  createEmptyStage2AuthoringState,
  safeParseStage2AuthoringState,
  safeParseRequirementsDocument,
  safeParseSkillInventory,
  applySkillUpdate,
  applyTeammateOp,
  applyStage2Extractions,
  appendStage2RecommendedAction,
  computeStructuralBlocker,
  computeStage2Readiness,
} from './state';

// ---- Constraint computation (pure) ----
export {
  computeStrongestTier,
  classifyGap,
  computeConstraints,
} from './constraints';

// ---- Extractor (per-turn structured) ----
export type {
  ExtractAndPlanStage2Result,
  Stage2InputType,
  Stage2AgentMove,
  Stage2ExtractedSkillUpdate,
  Stage2ExtractedTeamMention,
} from './extractor';
export { extractAndPlanStage2, ExtractAndPlanStage2Schema } from './extractor';

// ---- Agent (per-turn streaming) ----
export { streamStage2Message, streamTargetedTeamQuestion } from './agent';

// ---- Calibration prompts (exported for stage2-handler) ----
export { STAGE2_SYSTEM_PROMPT, renderStage2StableContext } from './calibration-prompts';

// ---- Expected Profile derivation ----
export type { DeriveExpectedProfileResult } from './expected-profile-agent';
export { deriveExpectedProfile } from './expected-profile-agent';

// ---- Expected Profile pushback (multi-round) ----
export type { RunPushbackRoundResult } from './expected-profile-pushback';
export { runExpectedProfilePushbackRound } from './expected-profile-pushback';

// ---- Composer ----
export { composeRequirementsDocument } from './composer';
