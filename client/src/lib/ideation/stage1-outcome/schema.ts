// src/lib/ideation/stage1-outcome/schema.ts
import { z } from 'zod';
import {
  TIME_HORIZONS,
  FINANCIAL_GOAL_SHAPES,
  RISK_TOLERANCES,
  LIFESTYLE_PREFERENCES,
  RECOMMENDED_ACTION_SEVERITIES,
  RECOMMENDED_ACTION_STATUSES,
} from '@neuralaunch/constants';

// ---------------------------------------------------------------------------
// Belief field wrapper — mirrors lib/discovery/context-schema's pattern
// so the same { value, confidence, extractedAt } shape underlies every
// dimension. We declare it locally rather than importing from Discovery
// to keep the ideation module independent of Discovery's 14-field
// DiscoveryContext.
// ---------------------------------------------------------------------------

const beliefField = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value:       valueSchema.nullable(),
    confidence:  z.number(),                    // post-clamped to [0,1] in state.ts
    extractedAt: z.string().nullable(),         // ISO timestamp string
  });

// ---------------------------------------------------------------------------
// The four Stage 1 dimensions
// ---------------------------------------------------------------------------

const TimeHorizonValueSchema       = z.enum(TIME_HORIZONS);
const RiskToleranceValueSchema     = z.enum(RISK_TOLERANCES);
const LifestylePreferenceValueSchema = z.enum(LIFESTYLE_PREFERENCES);

/**
 * Financial goal carries TWO sub-fields — the shape (an enum) and a
 * free-text target ("£3k/month", "$5M ARR by year 3"). Target is
 * optional and string-side; no `.max()` here because Anthropic does
 * not consistently enforce string length during structured generation
 * (see CLAUDE.md Reliability section). Length intent lives in the
 * .describe() copy; bounds are post-clamped in state.ts.
 */
const FinancialGoalValueSchema = z.object({
  shape:  z.enum(FINANCIAL_GOAL_SHAPES),
  target: z.string().nullable().describe(
    "Free-text target like '£3k/month' or 'replace my salary' or null when the " +
    "founder has not yet quantified. Aim for under 80 characters; the post-parse " +
    "clamp will truncate longer values.",
  ),
});

export const OutcomeDimensionsSchema = z.object({
  timeHorizon:         beliefField(TimeHorizonValueSchema),
  financialGoal:       beliefField(FinancialGoalValueSchema),
  riskTolerance:       beliefField(RiskToleranceValueSchema),
  lifestylePreference: beliefField(LifestylePreferenceValueSchema),
});
export type OutcomeDimensions = z.infer<typeof OutcomeDimensionsSchema>;

// ---------------------------------------------------------------------------
// Recommended action — entries the reality-grounding loop appends
// during authoring. Persisted across the authoring → output_ready →
// committed status transitions; founder responses can flip them.
// ---------------------------------------------------------------------------

export const RecommendedActionSchema = z.object({
  /**
   * The concrete real-world action the agent is recommending. Aim for
   * one clear sentence under 200 characters; clamped in state.ts.
   */
  action:    z.string(),
  severity:  z.enum(RECOMMENDED_ACTION_SEVERITIES),
  /** ISO timestamp string. */
  raisedAt:  z.string(),
  status:    z.enum(RECOMMENDED_ACTION_STATUSES),
  /**
   * What the founder said about this action when they pushed back or
   * marked it completed. Null until they respond. Free text — clamped
   * post-parse the same way the dimension `target` is.
   */
  founderResponse: z.string().nullable(),
});
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

// ---------------------------------------------------------------------------
// OutcomeDocument — the artifact the composer produces and the founder
// reviews. Lives in IdeationStageRun.output when status is
// 'output_ready' or 'committed'.
// ---------------------------------------------------------------------------

export const OutcomeDocumentSchema = z.object({
  dimensions: OutcomeDimensionsSchema,
  /**
   * Composer's prose synthesis connecting the 4 dimensions into a
   * coherent picture. 3-5 sentences; clamped post-parse. No .max()
   * inline so Anthropic's structured-output validator does not reject
   * legitimate generations (see CLAUDE.md).
   */
  synthesisParagraph: z.string().describe(
    "Connect the founder's time horizon, financial goal, risk tolerance, and " +
    "lifestyle preference into ONE coherent picture in 3-5 sentences. Speak " +
    "in plain language. Surface the trade-offs that fall out of these four " +
    "choices — what they are choosing INTO, not just what they said.",
  ),
  /**
   * 2-3 sentences naming what this outcome explicitly does NOT fit.
   * Helps Stages 2-5 prune options. Clamped post-parse.
   */
  rulesOut: z.string().describe(
    "In 2-3 sentences, name what this outcome explicitly DOES NOT fit. " +
    "Example: 'This rules out venture-backed software where time-to-revenue " +
    "exceeds 18 months; the founder needs replacement income inside 12.' " +
    "Be concrete — abstract disclaimers (e.g. 'not for the risk-averse') " +
    "are unhelpful.",
  ),
  recommendedActions: z.array(RecommendedActionSchema),
});
export type OutcomeDocument = z.infer<typeof OutcomeDocumentSchema>;

// ---------------------------------------------------------------------------
// Authoring state — the partial shape that lives in IdeationStageRun.output
// while status='authoring'. Carries the same dimensions + actions plus
// the drift tracker and the edit-discard snapshot.
// ---------------------------------------------------------------------------

/**
 * When `edit` reverts a row from 'output_ready' / 'committed' back to
 * 'authoring', the prior document is snapshotted here so a "discard
 * edit" can restore it. Carries the priorStatus so we know whether to
 * restore to 'output_ready' or 'committed' on discard.
 */
export const PriorCommittedSnapshotSchema = z.object({
  document:     OutcomeDocumentSchema,
  priorStatus:  z.enum(['output_ready', 'committed']),
});
export type PriorCommittedSnapshot = z.infer<typeof PriorCommittedSnapshotSchema>;

export const Stage1AuthoringStateSchema = z.object({
  dimensions:         OutcomeDimensionsSchema,
  recommendedActions: z.array(RecommendedActionSchema),
  /**
   * Drift signal — incremented each turn that does NOT raise any
   * dimension to MIN_OUTCOME_FIELD_CONFIDENCE for the first time;
   * reset to 0 whenever a dimension crosses that threshold. Surfaces
   * via `extractAndPlan` to bias the LLM toward driftDetected=true.
   */
  questionsSinceLastConfidenceGain: z.number(),
  /**
   * When non-null, the founder is editing one specific dimension and
   * the agent should focus questions on that dim alone. Reset to null
   * on recommit.
   */
  editTargetDimension: z.enum([
    'timeHorizon',
    'financialGoal',
    'riskTolerance',
    'lifestylePreference',
  ]).nullable(),
  /** See PriorCommittedSnapshotSchema. */
  priorCommittedSnapshot: PriorCommittedSnapshotSchema.nullable(),
  /**
   * ISO timestamp captured by `revertToEdit` when this row enters
   * edit mode. The dedicated /stage1-edit-probe route uses it as the
   * re-fire guard: an assistant Message row with `createdAt >
   * editStartedAt` means the probe already ran for this edit, so
   * subsequent calls 409 instead of overwriting the streamed probe.
   *
   * `.default(null)` so authoring states persisted BEFORE this field
   * was added still parse cleanly. New empty states and every
   * revertToEdit write set it explicitly.
   */
  editStartedAt: z.string().nullable().default(null),
});
export type Stage1AuthoringState = z.infer<typeof Stage1AuthoringStateSchema>;
