// src/lib/ideation/stage2-requirements/schema.ts
import { z } from 'zod';
import {
  SKILL_KEYS,
  SKILL_TIERS,
  GAP_SEVERITIES,
  STRUCTURAL_BLOCKER_CHOICES,
  EXPECTED_PROFILE_PUSHBACK_ACTIONS,
  EXPECTED_PROFILE_PUSHBACK_MODES,
} from '@neuralaunch/constants';
import { RecommendedActionSchema } from '../stage1-outcome/schema';
// Import from the types file directly to avoid pulling in the
// research clients (tavily/exa) at module load time. The clients
// touch env vars at import which crashes vitest's headless env.
import { ResearchLogEntrySchema } from '@/lib/research/types';

// ---------------------------------------------------------------------------
// Atomic enums (re-exported from @neuralaunch/constants via z.enum)
// ---------------------------------------------------------------------------

export const SkillKeySchema = z.enum(SKILL_KEYS);
export const SkillTierSchema = z.enum(SKILL_TIERS);
export const GapSeveritySchema = z.enum(GAP_SEVERITIES);
export const StructuralBlockerChoiceSchema = z.enum(STRUCTURAL_BLOCKER_CHOICES);
export const ExpectedProfilePushbackActionSchema = z.enum(EXPECTED_PROFILE_PUSHBACK_ACTIONS);
export const ExpectedProfilePushbackModeSchema = z.enum(EXPECTED_PROFILE_PUSHBACK_MODES);

// ---------------------------------------------------------------------------
// Skill Inventory — persistence shape
//
// `tiers` is a record across the 14 SKILL_KEYS. At runtime we always
// populate every key (createEmptyPersonSkills sets each to 'unknown')
// so consumers can read without optional-chaining, but the schema
// validates whatever shape the JSONB row contains.
// ---------------------------------------------------------------------------

export const PersonSkillsSchema = z.object({
  /** null = the founder themselves; a string = a teammate's name */
  name:  z.string().nullable(),
  tiers: z.record(SkillKeySchema, SkillTierSchema),
});
export type PersonSkills = z.infer<typeof PersonSkillsSchema>;

export const SkillInventorySchema = z.object({
  founder:       PersonSkillsSchema,
  team:          z.array(PersonSkillsSchema),
  lastUpdatedAt: z.string(),
});
export type SkillInventory = z.infer<typeof SkillInventorySchema>;

// ---------------------------------------------------------------------------
// Expected Profile — derived from the Stage 1 OutcomeDocument.
//
// Each entry is one (skill, requiredTier) pair with reasoning, source
// citations, and an optional pushback history. Per the plan, the
// "question this" affordance opens a multi-round pushback on a single
// entry — the engine state lives inside this entry, not as a separate
// table row.
// ---------------------------------------------------------------------------

export const ExpectedProfilePushbackHistoryEntrySchema = z.object({
  round:           z.number().describe('1-indexed; capped at EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND'),
  founderMessage:  z.string(),
  agentAction:     ExpectedProfilePushbackActionSchema,
  agentMode:       ExpectedProfilePushbackModeSchema,
  agentMessage:    z.string(),
  raisedAt:        z.string(),
});
export type ExpectedProfilePushbackHistoryEntry =
  z.infer<typeof ExpectedProfilePushbackHistoryEntrySchema>;

export const ExpectedProfilePushbackStateSchema = z.object({
  history: z.array(ExpectedProfilePushbackHistoryEntrySchema),
  /** Optimistic lock — incremented on every write; reject stale writes. */
  version: z.number(),
  /** 'open' = still accepting rounds; 'closed' = closing move fired or hard cap reached. */
  status:  z.enum(['open', 'closed']),
});
export type ExpectedProfilePushbackState =
  z.infer<typeof ExpectedProfilePushbackStateSchema>;

export const ExpectedProfileEntrySchema = z.object({
  skill:        SkillKeySchema,
  requiredTier: SkillTierSchema,
  /**
   * True when this entry is load-bearing for the outcome — e.g.
   * a venture_scale outcome requires Good sales. False when the entry
   * is supportive but not deal-breaking. The structural-blocker
   * threshold counts constraints on `critical: true` entries only.
   */
  critical:     z.boolean(),
  /**
   * Why this skill at this tier is required for the OutcomeDocument.
   * No .max() per CLAUDE.md; bounds via post-parse clamp.
   */
  reasoning:    z.string().describe(
    "1-3 sentences naming why this skill at this tier is required to " +
    "reach the founder's stated outcome. Reference the OutcomeDocument's " +
    "dimensions explicitly. Aim for under 400 characters; post-parse " +
    "clamp truncates anything longer.",
  ),
  /**
   * Citation tokens — references to OutcomeDocument dimensions
   * (e.g. 'lifestylePreference', 'financialGoal.shape') and/or
   * research findings the agent used. Free-form strings; the UI
   * renders them as inline chips.
   */
  sources:      z.array(z.string()).describe(
    "References for the requirement. Use OutcomeDocument field names " +
    "(e.g. 'lifestylePreference=fundable_startup') or short research " +
    "citations. Keep each under 80 characters.",
  ),
  /**
   * Optional pushback state — populated when the founder uses the
   * "question this" affordance on this entry. Null before any
   * pushback round; persists across rounds.
   */
  pushback:     ExpectedProfilePushbackStateSchema.nullable(),
});
export type ExpectedProfileEntry = z.infer<typeof ExpectedProfileEntrySchema>;

// ---------------------------------------------------------------------------
// Constraints — derived deterministically from inventory + expected.
// ---------------------------------------------------------------------------

export const ConstraintSchema = z.object({
  skill:        SkillKeySchema,
  requiredTier: SkillTierSchema,
  /**
   * Strongest-across-team tier for this skill. Computed by
   * constraints.ts: pick the highest tier (good > acceptable > bad)
   * across the founder + every teammate. 'unknown' propagates through
   * to surface as a blind_spot severity.
   */
  actualTier:   SkillTierSchema,
  gap:          GapSeveritySchema,
  critical:     z.boolean(),
  implication:  z.string().describe(
    "One sentence: what this gap means for opportunity selection " +
    "downstream. Aim for under 200 characters; post-parse clamp " +
    "truncates anything longer.",
  ),
});
export type Constraint = z.infer<typeof ConstraintSchema>;

// ---------------------------------------------------------------------------
// Structural blocker — the soft-warning state.
// ---------------------------------------------------------------------------

export const StructuralBlockerSchema = z.object({
  /** True when the threshold trips; false otherwise. Recomputed when constraints change. */
  triggered:     z.boolean(),
  /** Founder's choice when the warning surfaces; 'not_yet_chosen' until they encounter it. */
  founderChoice: StructuralBlockerChoiceSchema,
  /** Founder's own words when they explain their choice. Free text. */
  notes:         z.string().nullable(),
});
export type StructuralBlocker = z.infer<typeof StructuralBlockerSchema>;

// ---------------------------------------------------------------------------
// RequirementsDocument — Stage 2 artifact (status='output_ready'/'committed')
// ---------------------------------------------------------------------------

export const RequirementsDocumentSchema = z.object({
  /**
   * Snapshot of the founder + team skill inventory at the moment the
   * document is composed. Immutable history; FounderProfile.skillInventory
   * holds the latest live state.
   */
  skillInventorySnapshot: SkillInventorySchema,
  expectedProfile:        z.array(ExpectedProfileEntrySchema),
  constraints:            z.array(ConstraintSchema),
  recommendedActions:     z.array(RecommendedActionSchema),
  structuralBlocker:      StructuralBlockerSchema,
  /**
   * Audit log of research tool calls made during Expected Profile
   * derivation. Persisted alongside the artifact so reviewers can
   * see what evidence the agent consulted.
   */
  researchLog:            z.array(ResearchLogEntrySchema),
  composedAt:             z.string(),
});
export type RequirementsDocument = z.infer<typeof RequirementsDocumentSchema>;

// ---------------------------------------------------------------------------
// Stage 2 Authoring state — status='authoring' shape of output JSON
// ---------------------------------------------------------------------------

/**
 * Cascade snapshot — populated when Stage 1's /edit cascades a revert
 * onto this row. Mirrors Stage 1's PriorCommittedSnapshot pattern so
 * a Stage 1 /discard-edit can fully restore Stage 2 too.
 *
 * Cleared by /commit on Stage 1 (recommit invalidates the snapshot —
 * its document was derived against the now-stale OutcomeDocument)
 * and by /discard-edit on Stage 1 (after restoring).
 */
export const Stage2CascadeSnapshotSchema = z.object({
  document:    RequirementsDocumentSchema,
  priorStatus: z.enum(['output_ready', 'committed']),
});
export type Stage2CascadeSnapshot = z.infer<typeof Stage2CascadeSnapshotSchema>;

export const Stage2AuthoringStateSchema = z.object({
  /**
   * Live working copy of the skill inventory during Stage 2 authoring.
   * Mirrors FounderProfile.skillInventory after every dual-write turn —
   * the FounderProfile version is the persistent latest state;
   * `workingInventory` is the in-attempt snapshot used by the
   * extractor + composer.
   */
  workingInventory: SkillInventorySchema,
  /**
   * Expected Profile entries derived so far. Null = derivation hasn't
   * been run for this attempt. Non-empty array = derivation ran;
   * entries may individually carry pushback state.
   */
  workingExpectedProfile: z.array(ExpectedProfileEntrySchema).nullable(),
  /**
   * Recommended actions accumulated during this Stage 2 attempt.
   * Persisted across the authoring → output_ready → committed → edit
   * cycle (same as Stage 1's pattern).
   */
  recommendedActions: z.array(RecommendedActionSchema),
  /**
   * True once the agent has asked the targeted team-question on this
   * attempt (team-needing outcome + empty team). Prevents the agent
   * from re-asking on every subsequent turn.
   */
  teamQuestionAsked: z.boolean(),
  /**
   * True when this row was reverted by Stage 1's /edit cascade and
   * the founder has NOT yet re-derived the Expected Profile against
   * the updated OutcomeDocument. Used by the UI to surface a
   * "Stage 1 was updated — review your Requirements" prompt.
   */
  requiresRederivation: z.boolean(),
  /** See Stage2CascadeSnapshotSchema. */
  cascadeSnapshot:    Stage2CascadeSnapshotSchema.nullable(),
  /**
   * Drift signal — number of calibration-chat turns since the
   * working inventory last received a tier update. Surfaces via the
   * extractor's driftDetected flag to bias toward soft-close.
   */
  calibrationTurnsSinceLastUpdate: z.number(),
  /**
   * Working state of the structural-blocker recording. Carries through
   * to the composed RequirementsDocument unchanged.
   */
  structuralBlocker: StructuralBlockerSchema,
  /**
   * Research log accumulated by the most recent Expected Profile
   * derivation attempt. Cleared when derivation re-runs; persisted
   * into the final document at commit.
   */
  researchLog: z.array(ResearchLogEntrySchema),
});
export type Stage2AuthoringState = z.infer<typeof Stage2AuthoringStateSchema>;
