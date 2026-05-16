// src/lib/ideation/stage3-opportunities/schema.ts
//
// Zod shapes for Stage 3 — Opportunity Identification.
//
// Status-discriminated IdeationStageRun.output:
//   - 'authoring'   → Stage3AuthoringStateSchema
//   - 'output_ready' | 'committed' → PainInventoryDocumentSchema
//
// CLAUDE.md rules applied throughout:
//   - No .max() on strings in LLM-output schemas (post-clamp in state.ts)
//   - No .int() / .min() / .max() on numeric fields in LLM-output schemas
//     (post-clamp in state.ts via clampScore / clampCombined / etc.)
//
// PainPoint.id is `string` (crypto.randomUUID() at creation site).

import { z } from 'zod';
import {
  FOUNDER_CONTEXT_TAGS,
  PAIN_POINT_STATUSES,
  PAIN_SCORE_PUSHBACK_ACTIONS,
  PAIN_SCORE_PUSHBACK_MODES,
} from '@neuralaunch/constants';
import { RecommendedActionSchema } from '../stage1-outcome/schema';
import { ResearchLogEntrySchema } from '@/lib/research/types';

// ---------------------------------------------------------------------------
// Per-pain-point score-pushback history (one entry per round)
// ---------------------------------------------------------------------------

export const ScorePushbackHistoryEntrySchema = z.object({
  round:           z.number(),                        // 1-based
  founderMessage:  z.string(),                        // clamped post-parse
  agentMessage:    z.string(),                        // clamped post-parse
  agentMode:       z.enum(PAIN_SCORE_PUSHBACK_MODES),
  agentAction:     z.enum(PAIN_SCORE_PUSHBACK_ACTIONS),
  /** ISO timestamp when the round was applied. */
  raisedAt:        z.string(),
});
export type ScorePushbackHistoryEntry = z.infer<typeof ScorePushbackHistoryEntrySchema>;

// ---------------------------------------------------------------------------
// Score sub-shapes
// ---------------------------------------------------------------------------

/**
 * Agent's suggested scores per pain point — produced by the Pain
 * Scout's evaluation pass. 1-5 on each axis; values are post-
 * clamped to [1, 5] in state.ts to satisfy CLAUDE.md's no-.int/.min/.max
 * rule on LLM-output schemas.
 *
 * `reasoningPerMetric` is one short sentence explaining all three
 * scores together; the founder reads it when challenging.
 */
export const AgentSuggestedScoresSchema = z.object({
  intensity:          z.number(),
  frequency:          z.number(),
  nicheSpecificity:   z.number(),
  reasoningPerMetric: z.string(),
});
export type AgentSuggestedScores = z.infer<typeof AgentSuggestedScoresSchema>;

/**
 * Founder's final scores — set after rating / calibration / push-
 * back. Drives the combinedScore (intensity × frequency ×
 * nicheSpecificity) used for shortlist ranking.
 */
export const FounderFinalScoresSchema = z.object({
  intensity:        z.number(),
  frequency:        z.number(),
  nicheSpecificity: z.number(),
});
export type FounderFinalScores = z.infer<typeof FounderFinalScoresSchema>;

// ---------------------------------------------------------------------------
// PainPoint — the central entity
// ---------------------------------------------------------------------------

export const PainPointSchema = z.object({
  /** Stable id — crypto.randomUUID() at creation. */
  id:                   z.string(),

  /** Plain-language description. Founder reads + edits this. */
  description:          z.string(),

  /** Which scout layer produced this entry. */
  source:               z.enum(['agent', 'founder']),

  // ── Agent-side metadata (null when source='founder') ─────────────────
  /** Canonicalised URL the agent pulled this from. */
  evidenceUrl:          z.string().nullable(),
  /**
   * ≤280 chars, post-clamped via EVIDENCE_EXCERPT_MAX_CHARS. Full
   * post bodies NEVER persist server-side; the founder clicks
   * through to the source for full context.
   */
  evidenceExcerpt:      z.string().nullable(),
  /** Human-readable platform name, e.g. "Hacker News thread". */
  communityOrigin:      z.string().nullable(),
  /** Why the agent thinks this is relevant — one short sentence. */
  agentRelevanceNote:   z.string().nullable(),

  // ── Founder-side metadata (typically null when source='agent') ───────
  /** Where the founder sourced this from. */
  founderContext:       z.enum(FOUNDER_CONTEXT_TAGS).nullable(),
  /** Free-text notes the founder added when entering this. */
  founderNotes:         z.string().nullable(),

  // ── Shared: scoring + pushback ──────────────────────────────────────
  agentSuggestedScores: AgentSuggestedScoresSchema.nullable(),
  founderFinalScores:   FounderFinalScoresSchema.nullable(),
  /**
   * Product of founderFinalScores' three axes (intensity × frequency
   * × nicheSpecificity). Computed deterministically by
   * computeCombinedScore in state.ts — the schema persists the
   * pre-computed value so reads don't re-derive. Null until
   * founderFinalScores is set.
   */
  combinedScore:        z.number().nullable(),
  scorePushbackHistory: z.array(ScorePushbackHistoryEntrySchema),
  /**
   * Optimistic lock for per-pain-point pushback writes. The route
   * receives the founder's last-seen version, refuses the write if
   * the row has advanced. Increments on each successful round.
   */
  scorePushbackVersion: z.number(),

  /** Lifecycle. See PAIN_POINT_STATUSES in @neuralaunch/constants. */
  status:               z.enum(PAIN_POINT_STATUSES),
});
export type PainPoint = z.infer<typeof PainPointSchema>;

// ---------------------------------------------------------------------------
// Final document — lives in IdeationStageRun.output when status is
// 'output_ready' or 'committed'
//
// Declared BEFORE Stage3CascadeSnapshotSchema so the cascade snapshot
// can reference this shape directly without z.lazy() wrapping.
// ---------------------------------------------------------------------------

export const PainInventoryDocumentSchema = z.object({
  /** Full pain-point inventory, frozen at composition time. */
  painPointsSnapshot: z.array(PainPointSchema),
  /** Ordered list of pain-point ids that made the shortlist. */
  shortlist:          z.array(z.string()),
  /** Persisted gate values so downstream consumers don't re-import them. */
  shortlistFloor:     z.literal(3),
  shortlistTarget:    z.literal(5),
  shortlistCap:       z.literal(5),
  /**
   * "Why these N and not others" — short prose, LLM-generated by
   * the composer. Helps Stage 4 reason about what was excluded.
   * Clamped post-parse.
   */
  rulesOut:           z.string(),
  recommendedActions: z.array(RecommendedActionSchema),
  researchLog:        z.array(ResearchLogEntrySchema),
  composedAt:         z.string(),
});
export type PainInventoryDocument = z.infer<typeof PainInventoryDocumentSchema>;

// ---------------------------------------------------------------------------
// Cascade snapshot — Stage 1 OR Stage 2 edit invalidates Stage 3
// ---------------------------------------------------------------------------

/**
 * When EITHER Stage 1 or Stage 2 reverts via /edit, Stage 3 (if
 * committed or output_ready) reverts to authoring with this
 * snapshot captured. `triggeringStages` carries which upstream
 * fired the cascade; the three-rule state machine in
 * cross-stage-cascades.ts handles single-source + dual-source
 * + recommit-after-edit cases.
 *
 * See docs/stage3-handoff.md § 2.1 for the full state machine.
 */
export const Stage3CascadeSnapshotSchema = z.object({
  document:         PainInventoryDocumentSchema,
  triggeringStages: z.array(z.enum(['stage1', 'stage2'])),
  snapshottedAt:    z.string(),
});
export type Stage3CascadeSnapshot = z.infer<typeof Stage3CascadeSnapshotSchema>;

// ---------------------------------------------------------------------------
// Authoring state — lives in IdeationStageRun.output while status='authoring'
// ---------------------------------------------------------------------------

export const Stage3AuthoringStateSchema = z.object({
  /** Mentions the agent has surfaced. */
  agentPainPoints:    z.array(PainPointSchema),
  /** Pain points the founder added themselves (Human Scout layer). */
  founderPainPoints:  z.array(PainPointSchema),
  recommendedActions: z.array(RecommendedActionSchema),
  researchLog:        z.array(ResearchLogEntrySchema),
  /**
   * Number of times the Pain Scout has been re-fired on this stage
   * run. Capped by MAX_SCOUT_RUNS (5); the route refuses re-fires
   * at the cap.
   */
  scoutRunCount:      z.number(),
  cascadeSnapshot:    Stage3CascadeSnapshotSchema.nullable(),
  requiresRederivation: z.boolean(),
});
export type Stage3AuthoringState = z.infer<typeof Stage3AuthoringStateSchema>;
