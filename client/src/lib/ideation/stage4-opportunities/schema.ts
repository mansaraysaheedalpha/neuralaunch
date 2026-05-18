// src/lib/ideation/stage4-opportunities/schema.ts
//
// Zod shapes for Stage 4 — Opportunity Evaluation & Research.
//
// Status-discriminated IdeationStageRun.output:
//   - 'authoring'   → Stage4AuthoringStateSchema
//   - 'output_ready' | 'committed' → OpportunityEvaluationsDocumentSchema
//
// CLAUDE.md rules applied throughout:
//   - No .max() on strings in LLM-output schemas (post-clamp in state.ts)
//   - No .int() / .min() / .max() on numeric fields in LLM-output
//     schemas (the only numerics here are vote counts / sentiment
//     counts which post-clamp at parse time)

import { z } from 'zod';
import {
  OPPORTUNITY_VERDICTS,
  OPPORTUNITY_STATUSES,
  VALIDATION_STRENGTHS,
  COMMUNITY_RESPONSE_SOURCES,
  COMMUNITY_COMMENT_SENTIMENTS,
  OPPORTUNITY_PUSHBACK_ACTIONS,
  OPPORTUNITY_PUSHBACK_MODES,
} from '@neuralaunch/constants';
import { RecommendedActionSchema } from '../stage1-outcome/schema';
import { ResearchLogEntrySchema } from '@/lib/research/types';

// ---------------------------------------------------------------------------
// Layer A — per-dimension finding shape
// ---------------------------------------------------------------------------

export const CitationSchema = z.object({
  url:            z.string(),
  excerpt:        z.string(),
  sourcePlatform: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

/**
 * One Layer A dimension finding. Produced by the research agent for
 * each of the four dimensions (Market Reality / Customer Access /
 * Will People Pay / Market Size). Reasoning + 1-3 citations. Confidence
 * post-clamps to [0,1] in state.ts.
 */
export const DimensionFindingSchema = z.object({
  reasoning:  z.string(),
  citations:  z.array(CitationSchema),
  confidence: z.number(),
});
export type DimensionFinding = z.infer<typeof DimensionFindingSchema>;

/**
 * The full Layer A research bundle for one opportunity. Each of the
 * four dimensions gets its own DimensionFinding; the bundle is set
 * atomically by the derive-opportunity-research route.
 */
export const LayerAResearchSchema = z.object({
  marketReality:  DimensionFindingSchema,
  customerAccess: DimensionFindingSchema,
  willPeoplePay:  DimensionFindingSchema,
  marketSize:     DimensionFindingSchema,
  researchedAt:   z.string(),
});
export type LayerAResearch = z.infer<typeof LayerAResearchSchema>;

// ---------------------------------------------------------------------------
// Layer B — founder community engagement
// ---------------------------------------------------------------------------

/**
 * Agent-generated test script for one opportunity. Tells the founder
 * which platforms to post in, what to post, and what to ask.
 */
export const LayerBScriptSchema = z.object({
  platforms:      z.array(z.string()),
  postWording:    z.string(),
  questionsToAsk: z.array(z.string()),
  generatedAt:    z.string(),
});
export type LayerBScript = z.infer<typeof LayerBScriptSchema>;

/**
 * One comment extracted from a screenshot by the vision-extractor.
 * Per-comment sentiment lives here; the aggregate (positive / neutral
 * / negative counts) is computed downstream in state.ts.
 */
export const CommunityCommentSchema = z.object({
  authorHandle: z.string(),
  text:         z.string(),
  sentiment:    z.enum(COMMUNITY_COMMENT_SENTIMENTS),
  voteCount:    z.number().nullable(),
});
export type CommunityComment = z.infer<typeof CommunityCommentSchema>;

/**
 * What the vision-extractor produced for one CommunityResponse. Empty
 * for text_paste responses — those don't go through vision; their
 * pastedText surfaces directly to the verdict synthesizer.
 */
export const ExtractedSignalSchema = z.object({
  platformIdentified:   z.string(),
  originalPost: z.object({
    visible:     z.boolean(),
    voteCount:   z.number().nullable(),
    bodyExcerpt: z.string(),
  }),
  comments:             z.array(CommunityCommentSchema),
  keyQuotes:            z.array(z.string()),
  contradictionsToPain: z.array(z.string()),
  unparseableNotes:     z.string().nullable(),
});
export type ExtractedSignal = z.infer<typeof ExtractedSignalSchema>;

/**
 * One captured community response. Either a pasted text snippet OR a
 * screenshot uploaded to S3. Source-discriminated by `source`.
 *
 * PII contract: pastedText is treated as opaque founder content end-
 * to-end. s3Url is a presigned read URL re-issued on each read; we
 * persist s3Key for cleanup and re-presign.
 */
export const CommunityResponseSchema = z.object({
  id:            z.string(),
  opportunityId: z.string(),
  source:        z.enum(COMMUNITY_RESPONSE_SOURCES),

  // text_paste fields (null when source='screenshot')
  pastedText:    z.string().nullable(),

  // screenshot fields (null when source='text_paste')
  s3Url:         z.string().nullable(),
  s3Key:         z.string().nullable(),

  uploadedAt:       z.string(),
  extractedAt:      z.string().nullable(),
  extractedSignal:  ExtractedSignalSchema.nullable(),
  moderationPassed: z.boolean(),
  /**
   * Populated when moderationPassed=false. The Haiku moderation gate
   * returns a short `reason` string when it explicitly fails an
   * image; the route layer also sets `moderation_call_failed` when
   * the gate call itself errors (network, quota, SDK throw). Null on
   * text_paste rows and on screenshot rows where the gate hasn't
   * fired yet.
   */
  moderationReason: z.string().nullable(),
});
export type CommunityResponse = z.infer<typeof CommunityResponseSchema>;

/**
 * Aggregate validation signal computed across ALL CommunityResponse
 * rows for one opportunity. Driven by state.ts (deterministic math
 * over per-response sentiment counts + contradiction counts), not by
 * an LLM call.
 */
export const LayerBExtractedSignalSchema = z.object({
  validationStrength:  z.enum(VALIDATION_STRENGTHS),
  keyQuotes:           z.array(z.string()),
  sentimentBreakdown: z.object({
    positive: z.number(),
    neutral:  z.number(),
    negative: z.number(),
  }),
  contradictionsRaised: z.array(z.string()),
});
export type LayerBExtractedSignal = z.infer<typeof LayerBExtractedSignalSchema>;

// ---------------------------------------------------------------------------
// Per-opportunity pushback history (one entry per round)
// ---------------------------------------------------------------------------

export const OpportunityPushbackHistoryEntrySchema = z.object({
  round:          z.number(),
  founderMessage: z.string(),
  agentMessage:   z.string(),
  agentMode:      z.enum(OPPORTUNITY_PUSHBACK_MODES),
  agentAction:    z.enum(OPPORTUNITY_PUSHBACK_ACTIONS),
  raisedAt:       z.string(),
});
export type OpportunityPushbackHistoryEntry = z.infer<typeof OpportunityPushbackHistoryEntrySchema>;

// ---------------------------------------------------------------------------
// OpportunityEvaluation — the central entity
// ---------------------------------------------------------------------------

export const OpportunityEvaluationSchema = z.object({
  id:                  z.string(),
  /** Reference Stage 3 PainPoint.id this row was derived from. */
  painPointId:         z.string(),
  /** Denormalised so a Stage 3 edit doesn't break the Stage 4 frame. */
  painPointSummary:    z.string(),

  // Layer A
  layerAResearch:      LayerAResearchSchema.nullable(),

  // Layer B
  layerBScript:           LayerBScriptSchema.nullable(),
  /** References to CommunityResponse.id from the response pool. */
  layerBResponses:        z.array(z.string()),
  layerBExtractedSignal:  LayerBExtractedSignalSchema.nullable(),

  // Verdict + pushback
  agentVerdict:          z.enum([...OPPORTUNITY_VERDICTS, 'pending'] as [string, ...string[]]),
  agentReasoning:        z.string(),
  founderVerdict:        z.enum(OPPORTUNITY_VERDICTS).nullable(),
  pushbackHistory:       z.array(OpportunityPushbackHistoryEntrySchema),
  /** Optimistic lock for per-opportunity pushback writes. */
  pushbackVersion:       z.number(),

  status: z.enum(OPPORTUNITY_STATUSES),
});
export type OpportunityEvaluation = z.infer<typeof OpportunityEvaluationSchema>;

// ---------------------------------------------------------------------------
// Final document — lives in IdeationStageRun.output when status is
// 'output_ready' or 'committed'.
// ---------------------------------------------------------------------------

export const OpportunityEvaluationsDocumentSchema = z.object({
  /** Full evaluations frozen at composition time. */
  evaluations:       z.array(OpportunityEvaluationSchema),
  /** Full response pool frozen at composition time (denormalised). */
  responsesSnapshot: z.array(CommunityResponseSchema),
  /** The opportunity advanced to Stage 5. */
  chosenOpportunityId: z.string(),
  /** Why this one — short prose from the composer's LLM pass. */
  chosenRationale:   z.string(),
  /** Why the others were set aside — short prose. */
  rejectedRationale: z.string(),
  recommendedActions: z.array(RecommendedActionSchema),
  researchLog:       z.array(ResearchLogEntrySchema),
  composedAt:        z.string(),
});
export type OpportunityEvaluationsDocument = z.infer<typeof OpportunityEvaluationsDocumentSchema>;

// ---------------------------------------------------------------------------
// Cascade snapshot — Stage 1 OR 2 OR 3 edit invalidates Stage 4
// ---------------------------------------------------------------------------

/**
 * When ANY upstream stage (1, 2, or 3) reverts via /edit, Stage 4
 * (if output_ready or committed) reverts to authoring with this
 * snapshot captured. `triggeringStages[]` carries which upstream(s)
 * fired the cascade; the three-rule state machine in
 * cross-stage-cascades.ts handles single-source + multi-source +
 * recommit-after-edit cases (same shape as Stage 3's cascade
 * snapshot).
 */
export const Stage4CascadeSnapshotSchema = z.object({
  document:         OpportunityEvaluationsDocumentSchema,
  triggeringStages: z.array(z.enum(['stage1', 'stage2', 'stage3'])),
  snapshottedAt:    z.string(),
});
export type Stage4CascadeSnapshot = z.infer<typeof Stage4CascadeSnapshotSchema>;

// ---------------------------------------------------------------------------
// Authoring state — lives in IdeationStageRun.output while status='authoring'
// ---------------------------------------------------------------------------

export const Stage4AuthoringStateSchema = z.object({
  /** All opportunities the founder is evaluating in this session. */
  opportunities:       z.array(OpportunityEvaluationSchema),
  /** Response pool, keyed by id; per-opportunity refs live on the row. */
  founderCommunityResponses: z.array(CommunityResponseSchema),
  recommendedActions:  z.array(RecommendedActionSchema),
  researchLog:         z.array(ResearchLogEntrySchema),
  cascadeSnapshot:     Stage4CascadeSnapshotSchema.nullable(),
  requiresRederivation: z.boolean(),
});
export type Stage4AuthoringState = z.infer<typeof Stage4AuthoringStateSchema>;
