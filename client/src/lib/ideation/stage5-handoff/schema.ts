// src/lib/ideation/stage5-handoff/schema.ts
//
// Zod shapes for Stage 5 — Validation Handoff. The bridge to the
// legacy post-Discovery pipeline.
//
// Status-discriminated IdeationStageRun.output:
//   - 'authoring'   → Stage5AuthoringStateSchema
//   - 'output_ready' | 'committed' → Stage5HandoffDocumentSchema
//
// Stage 5's output is NOT a parallel artifact — it's a thin handoff
// record. The real artifact is the synthesized Recommendation row,
// referenced here by id.

import { z } from 'zod';
import { OPPORTUNITY_VERDICTS, VALIDATION_STRENGTHS } from '@neuralaunch/constants';
import { RecommendedActionSchema } from '../stage1-outcome/schema';

// ---------------------------------------------------------------------------
// ReserveOpportunitySchema — denormalised snapshot of one Stage 4
// OpportunityEvaluation that DID NOT advance. Lives on the
// Stage5HandoffDocument AND mirrored to Recommendation.ideationReserveOpportunities
// so the continuation brief can surface forks without re-reading Stage 4.
// ---------------------------------------------------------------------------

/** Compact Layer A summary for the reserve snapshot. */
const ReserveLayerASummarySchema = z.object({
  marketReality:  z.object({ reasoning: z.string(), confidence: z.number() }),
  customerAccess: z.object({ reasoning: z.string(), confidence: z.number() }),
  willPeoplePay:  z.object({ reasoning: z.string(), confidence: z.number() }),
  marketSize:     z.object({ reasoning: z.string(), confidence: z.number() }),
});
export type ReserveLayerASummary = z.infer<typeof ReserveLayerASummarySchema>;

/** Compact Layer B aggregate signal for the reserve snapshot. */
const ReserveLayerBSummarySchema = z.object({
  validationStrength:   z.enum(VALIDATION_STRENGTHS),
  sentimentBreakdown:   z.object({ positive: z.number(), neutral: z.number(), negative: z.number() }),
  keyQuotes:            z.array(z.string()),
  contradictionsRaised: z.array(z.string()),
});
export type ReserveLayerBSummary = z.infer<typeof ReserveLayerBSummarySchema>;

export const ReserveOpportunitySchema = z.object({
  /** Stage 4 OpportunityEvaluation.id. */
  id:                  z.string(),
  /** Denormalised pain-point summary so continuation brief can render without re-loading Stage 4. */
  painPointSummary:    z.string(),
  /** Stage 4 agent verdict at composition time. */
  agentVerdict:        z.enum([...OPPORTUNITY_VERDICTS, 'pending'] as [string, ...string[]]),
  /** Stage 4 founder verdict at composition time (null when the founder didn't reach this row before composing). */
  founderVerdict:      z.enum(OPPORTUNITY_VERDICTS).nullable(),
  /** Stage 4 agent's verdict-reasoning paragraph. */
  agentReasoning:      z.string(),
  /** Layer A four-dimension snapshot. Null when Layer A wasn't run on this reserve. */
  layerASummary:       ReserveLayerASummarySchema.nullable(),
  /** Layer B aggregate-signal snapshot. Null when no community responses landed. */
  layerBSummary:       ReserveLayerBSummarySchema.nullable(),
  /**
   * Ranked position among reserves (1 = top reserve, 4 = bottom).
   * The continuation brief uses this when prioritising which forks
   * to surface first.
   */
  rank:                z.number(),
});
export type ReserveOpportunity = z.infer<typeof ReserveOpportunitySchema>;

// ---------------------------------------------------------------------------
// ChosenOpportunitySnapshot — denormalised snapshot of the Stage 4
// chosen opportunity. The Stage 5 surface renders from this; cascade
// reverts use it to restore prior state.
// ---------------------------------------------------------------------------

export const ChosenOpportunitySnapshotSchema = z.object({
  id:                  z.string(),
  painPointSummary:    z.string(),
  agentVerdict:        z.enum([...OPPORTUNITY_VERDICTS, 'pending'] as [string, ...string[]]),
  founderVerdict:      z.enum(OPPORTUNITY_VERDICTS),
  agentReasoning:      z.string(),
  layerASummary:       ReserveLayerASummarySchema.nullable(),
  layerBSummary:       ReserveLayerBSummarySchema.nullable(),
});
export type ChosenOpportunitySnapshot = z.infer<typeof ChosenOpportunitySnapshotSchema>;

// ---------------------------------------------------------------------------
// Synthesis lifecycle status
// ---------------------------------------------------------------------------

export const SYNTHESIS_STATUSES = [
  'awaiting_synthesis',
  'synthesizing',
  'synthesized',
  'synthesis_failed',
] as const;
export type SynthesisStatus = typeof SYNTHESIS_STATUSES[number];

// ---------------------------------------------------------------------------
// Final document — lives in IdeationStageRun.output when status is
// 'output_ready' or 'committed'.
//
// Declared BEFORE the cascade snapshot so the cascade can reference
// it directly without z.lazy() (same pattern as Stage 3/4 cascade
// snapshots).
// ---------------------------------------------------------------------------

export const Stage5HandoffDocumentSchema = z.object({
  chosenOpportunity:    ChosenOpportunitySnapshotSchema,
  reserveOpportunities: z.array(ReserveOpportunitySchema),
  /** The synthesized Recommendation row's id. */
  synthesizedRecommendationId: z.string(),
  recommendedActions:   z.array(RecommendedActionSchema),
  composedAt:           z.string(),
});
export type Stage5HandoffDocument = z.infer<typeof Stage5HandoffDocumentSchema>;

// ---------------------------------------------------------------------------
// Cascade snapshot — Stage 1, 2, 3, OR 4 edit invalidates Stage 5
// (pre-acceptance only — post-acceptance the founder is in the
// legacy pipeline).
// ---------------------------------------------------------------------------

export const Stage5CascadeSnapshotSchema = z.object({
  document:         Stage5HandoffDocumentSchema,
  triggeringStages: z.array(z.enum(['stage1', 'stage2', 'stage3', 'stage4'])),
  snapshottedAt:    z.string(),
});
export type Stage5CascadeSnapshot = z.infer<typeof Stage5CascadeSnapshotSchema>;

// ---------------------------------------------------------------------------
// Authoring state — lives in IdeationStageRun.output while
// status='authoring'.
// ---------------------------------------------------------------------------

export const Stage5AuthoringStateSchema = z.object({
  chosenOpportunity:    ChosenOpportunitySnapshotSchema.nullable(),
  reserveOpportunities: z.array(ReserveOpportunitySchema),
  /** Set to the Recommendation row id after the synthesize route completes. */
  synthesizedRecommendationId: z.string().nullable(),
  synthesisStatus:      z.enum(SYNTHESIS_STATUSES),
  /** Populated when synthesisStatus='synthesis_failed' — short reason string. */
  synthesisError:       z.string().nullable(),
  recommendedActions:   z.array(RecommendedActionSchema),
  cascadeSnapshot:      Stage5CascadeSnapshotSchema.nullable(),
  requiresRederivation: z.boolean(),
});
export type Stage5AuthoringState = z.infer<typeof Stage5AuthoringStateSchema>;
