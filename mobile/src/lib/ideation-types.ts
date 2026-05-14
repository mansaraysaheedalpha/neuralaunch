// src/lib/ideation-types.ts
//
// Mobile-side TypeScript mirrors for the No Idea archetype's ideation
// types. The wire contract is the source of truth — these interfaces
// describe the shape this client receives from the web's
// /api/discovery/no-idea/[sessionId] hydration endpoint after the
// server applies its zod parsers. Mobile does not bundle zod for
// runtime validation.
//
// Keep this file in lock-step with the canonical zod schemas:
//   - Stage 1: client/src/lib/ideation/stage1-outcome/schema.ts
//   - Stage 2: client/src/lib/ideation/stage2-requirements/schema.ts
//   - Enums:   packages/constants/src/ideation.ts
//
// Drift detection: if you change one of the canonical schemas, search
// this file for the matching field. There's no automated check — the
// reason mobile doesn't import the workspace zod schema directly is
// that pulling zod into the RN bundle and getting the workspace
// resolution clean is a separate sprint of its own.

// ---------------------------------------------------------------------------
// Shared atomic enums (mirrors @neuralaunch/constants/ideation)
// ---------------------------------------------------------------------------

/** Stage 1 OutcomeDocument financial-goal shape. */
export type FinancialGoalShape =
  | 'side_income'
  | 'full_replacement'
  | 'modest_growth'
  | 'wealth_creation'
  | 'venture_scale';

/** Stage 2 — the 14 skill keys. */
export type SkillKey =
  | 'sales'
  | 'graphic_design'
  | 'product_design'
  | 'content_creative'
  | 'marketing'
  | 'public_speaking'
  | 'technical_literacy'
  | 'programming'
  | 'finance'
  | 'operational_efficiency'
  | 'leadership'
  | 'ai_literacy'
  | 'data_analysis'
  | 'distribution_community_building';

/** Stage 2 — skill tier (4 buckets). 'unknown' surfaces when the
 *  founder hasn't surfaced a self-assessment yet; the calibration
 *  chat normally moves chips between good/acceptable/bad. */
export type SkillTier = 'good' | 'acceptable' | 'bad' | 'unknown';

/** Stage 2 — gap severity for a derived Constraint. */
export type GapSeverity = 'mild' | 'structural' | 'blind_spot';

/** Stage 2 — founder's choice when the structural-blocker threshold
 *  trips. 'not_yet_chosen' is the initial state before the founder
 *  has seen the soft-warning card. */
export type StructuralBlockerChoice =
  | 'revisit_outcome'
  | 'plan_team_recruit'
  | 'pushed_back_and_committed'
  | 'not_yet_chosen';

/** Stage 2 Expected Profile pushback — agent action per round. */
export type ExpectedProfilePushbackAction =
  | 'continue_dialogue'
  | 'defend'
  | 'refine'
  | 'replace'
  | 'closing';

/** Stage 2 Expected Profile pushback — agent's read of founder mode. */
export type ExpectedProfilePushbackMode =
  | 'analytical'
  | 'fear'
  | 'lack_of_belief';

/** Recommended action severity (shared between Stages 1 and 2). */
export type RecommendedActionSeverity = 'strongly_advised' | 'suggested';

// ---------------------------------------------------------------------------
// Recommended action (shared Stage 1 + Stage 2)
// ---------------------------------------------------------------------------

export interface RecommendedAction {
  action:          string;
  severity:        RecommendedActionSeverity | string;
  raisedAt:        string;
  status:          string;
  founderResponse: string | null;
}

// ---------------------------------------------------------------------------
// Research log entry (referenced by Stage 2 RequirementsDocument)
// ---------------------------------------------------------------------------

export interface ResearchSource {
  url:     string;
  title?:  string;
  snippet?: string;
}

export interface ResearchLogEntry {
  query:          string;
  agent:          string;
  tool?:          string;
  resultSummary?: string;
  timestamp:      string;
  // Legacy fields kept so historic rows still parse.
  answer?:        string;
  sources?:       ResearchSource[];
  success?:       boolean;
}

// ---------------------------------------------------------------------------
// Stage 1 — Outcome Document
// (kept here so all ideation types live together; the existing copy
//  inside OutcomeDocumentView.tsx can migrate to this file in a
//  later cleanup, but we don't need to refactor it right now)
// ---------------------------------------------------------------------------

export interface BeliefField<T> {
  value:       T | null;
  confidence:  number;
  extractedAt: string | null;
}

export interface FinancialGoalValue {
  shape:  FinancialGoalShape | string;
  target: string | null;
}

export interface OutcomeDocument {
  dimensions: {
    timeHorizon:         BeliefField<string>;
    financialGoal:       BeliefField<FinancialGoalValue>;
    riskTolerance:       BeliefField<string>;
    lifestylePreference: BeliefField<string>;
  };
  synthesisParagraph: string;
  rulesOut:           string;
  recommendedActions: RecommendedAction[];
}

// ---------------------------------------------------------------------------
// Stage 2 — Skill inventory (founder + teammates)
// ---------------------------------------------------------------------------

/** Per-person tier map across the 14 skills. `name` is null for the
 *  founder themselves; a string for a teammate. The runtime invariant
 *  is that every SkillKey is present in `tiers` (server-side
 *  createEmptyPersonSkills seeds all 14 to 'unknown') but the schema
 *  uses Partial so a malformed row still parses. */
export interface PersonSkills {
  name:  string | null;
  tiers: Partial<Record<SkillKey, SkillTier>>;
}

export interface SkillInventory {
  founder:       PersonSkills;
  team:          PersonSkills[];
  lastUpdatedAt: string;
}

// ---------------------------------------------------------------------------
// Stage 2 — Expected Profile entry (+ pushback)
// ---------------------------------------------------------------------------

export interface ExpectedProfilePushbackHistoryEntry {
  /** 1-indexed; capped at EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND
   *  (5 on the canonical schema as of 2026-05-14). */
  round:          number;
  founderMessage: string;
  agentAction:    ExpectedProfilePushbackAction;
  agentMode:      ExpectedProfilePushbackMode;
  agentMessage:   string;
  raisedAt:       string;
}

export interface ExpectedProfilePushbackState {
  history: ExpectedProfilePushbackHistoryEntry[];
  /** Optimistic-lock version — incremented on every write. */
  version: number;
  status:  'open' | 'closed';
}

export interface ExpectedProfileEntry {
  skill:        SkillKey;
  requiredTier: SkillTier;
  /** True when this entry is load-bearing for the outcome — only
   *  critical entries count toward the structural-blocker threshold. */
  critical:     boolean;
  reasoning:    string;
  /** Citation tokens (OutcomeDocument field names, research labels). */
  sources:      string[];
  /** Null before the founder uses "question this" on this entry. */
  pushback:     ExpectedProfilePushbackState | null;
}

// ---------------------------------------------------------------------------
// Stage 2 — derived Constraint (deterministic from inventory + expected)
// ---------------------------------------------------------------------------

export interface Constraint {
  skill:        SkillKey;
  requiredTier: SkillTier;
  /** Strongest-across-team tier; computed by constraints.ts on the
   *  server. 'unknown' on a required skill surfaces as blind_spot. */
  actualTier:   SkillTier;
  gap:          GapSeverity;
  critical:     boolean;
  implication:  string;
}

// ---------------------------------------------------------------------------
// Stage 2 — Structural blocker (soft-warning state)
// ---------------------------------------------------------------------------

export interface StructuralBlocker {
  triggered:     boolean;
  founderChoice: StructuralBlockerChoice;
  notes:         string | null;
}

// ---------------------------------------------------------------------------
// Stage 2 — RequirementsDocument (status='output_ready'|'committed')
// ---------------------------------------------------------------------------

export interface RequirementsDocument {
  /** Inventory at composition time. FounderProfile.skillInventory
   *  holds the latest live state; this is the artifact's immutable
   *  history. */
  skillInventorySnapshot: SkillInventory;
  expectedProfile:        ExpectedProfileEntry[];
  constraints:            Constraint[];
  recommendedActions:     RecommendedAction[];
  structuralBlocker:      StructuralBlocker;
  researchLog:            ResearchLogEntry[];
  composedAt:             string;
}

// ---------------------------------------------------------------------------
// Stage 2 — Authoring state (status='authoring')
// ---------------------------------------------------------------------------

export interface Stage2CascadeSnapshot {
  document:    RequirementsDocument;
  priorStatus: 'output_ready' | 'committed';
}

export interface Stage2AuthoringState {
  /** Live working copy of the skill inventory during authoring.
   *  Mirrors FounderProfile.skillInventory after every dual-write. */
  workingInventory: SkillInventory;
  /** Null = derivation not yet run; non-empty = derivation produced
   *  these entries, individual entries may carry pushback state. */
  workingExpectedProfile: ExpectedProfileEntry[] | null;
  recommendedActions:     RecommendedAction[];
  /** True once the agent has asked the targeted team-question on
   *  this attempt — prevents re-asking on every subsequent turn. */
  teamQuestionAsked:      boolean;
  /** True when Stage 1's /edit cascaded a revert onto this row. The
   *  UI surfaces a "Stage 1 was updated — re-derive" prompt. */
  requiresRederivation:   boolean;
  cascadeSnapshot:        Stage2CascadeSnapshot | null;
  /** Drift signal — calibration-chat turns since the last tier
   *  update. Used by the extractor to bias toward soft-close. */
  calibrationTurnsSinceLastUpdate: number;
  structuralBlocker:      StructuralBlocker;
  researchLog:            ResearchLogEntry[];
}
