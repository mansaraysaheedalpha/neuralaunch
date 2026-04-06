// src/lib/discovery/constants.ts

/** Interview phase progression — do not reorder */
export const INTERVIEW_PHASES = {
  ORIENTATION:   'ORIENTATION',
  GOAL_CLARITY:  'GOAL_CLARITY',
  CONSTRAINT_MAP: 'CONSTRAINT_MAP',
  CONVICTION:    'CONVICTION',
  SYNTHESIS:     'SYNTHESIS',
} as const;

export type InterviewPhase = typeof INTERVIEW_PHASES[keyof typeof INTERVIEW_PHASES];

// ---------------------------------------------------------------------------
// Confidence thresholds
// ---------------------------------------------------------------------------

/** Minimum per-field confidence to count a field as "known" */
export const MIN_FIELD_CONFIDENCE = 0.65;

/** Fraction of required fields that must be "known" before synthesis is allowed */
export const SYNTHESIS_READINESS_RATIO = 0.80;

/** Expected information gain threshold below which we stop asking and synthesise */
export const MIN_EXPECTED_GAIN_TO_CONTINUE = 0.05;

// ---------------------------------------------------------------------------
// Question limits
// ---------------------------------------------------------------------------

export const MAX_QUESTIONS_PER_PHASE: Record<Exclude<InterviewPhase, 'SYNTHESIS'>, number> = {
  ORIENTATION:    4,
  GOAL_CLARITY:   5,
  CONSTRAINT_MAP: 6,
  CONVICTION:     3,
};

/** Hard ceiling on total questions — prevents endless sessions */
export const MAX_TOTAL_QUESTIONS = 15;

// ---------------------------------------------------------------------------
// Model identifiers — change here, nowhere else
// ---------------------------------------------------------------------------

export const MODELS = {
  /** Used for question generation and context extraction (speed + cost) */
  INTERVIEW:  'claude-sonnet-4-6',
  /** Used for final synthesis only (depth + reasoning quality) */
  SYNTHESIS:  'claude-opus-4-6',
} as const;

// ---------------------------------------------------------------------------
// Audience types — classified silently within the first 2 exchanges
// ---------------------------------------------------------------------------

export const AUDIENCE_TYPES = {
  LOST_GRADUATE:            'LOST_GRADUATE',
  STUCK_FOUNDER:            'STUCK_FOUNDER',
  ESTABLISHED_OWNER:        'ESTABLISHED_OWNER',
  ASPIRING_BUILDER:         'ASPIRING_BUILDER',
  MID_JOURNEY_PROFESSIONAL: 'MID_JOURNEY_PROFESSIONAL',
} as const;

export type AudienceType = typeof AUDIENCE_TYPES[keyof typeof AUDIENCE_TYPES];

// ---------------------------------------------------------------------------
// Recommendation types — what shape of action the recommendation prescribes
// ---------------------------------------------------------------------------

/**
 * Captures WHAT the recommendation prescribes (action shape), independent
 * of WHO the founder is (AudienceType). Together the two fields drive
 * routing decisions like "should the validation page CTA show on this
 * recommendation page?" and (in future) Phase 4/5 entry conditions.
 *
 * Set by the synthesis prompt as part of the structured Recommendation
 * output. Stored on the Recommendation Prisma model. The LLM never needs
 * to know about NeuraLaunch's tools — UI gating reads this field and
 * decides whether to surface tool buttons.
 */
export const RECOMMENDATION_TYPES = {
  /** Software product to build — the canonical Phase 3/4/5 path */
  BUILD_SOFTWARE:    'build_software',
  /** Productized service / consulting offer — may or may not include software */
  BUILD_SERVICE:     'build_service',
  /** Already has the product, the bottleneck is sales / outreach */
  SALES_MOTION:      'sales_motion',
  /** Behavioural or operational fix — no software, no new product */
  PROCESS_CHANGE:    'process_change',
  /** Bottleneck is capacity, not strategy — hire / outsource */
  HIRE_OR_OUTSOURCE: 'hire_or_outsource',
  /** Founder needs more data before any commitment can be made */
  FURTHER_RESEARCH:  'further_research',
  /** Anything that doesn't fit the above */
  OTHER:             'other',
} as const;

export type RecommendationType = typeof RECOMMENDATION_TYPES[keyof typeof RECOMMENDATION_TYPES];

/**
 * The set of recommendation types for which the validation landing page
 * mechanic is applicable. Used by UI gating in RecommendationReveal.
 *
 * Currently restricted to BUILD_SOFTWARE only. BUILD_SERVICE may be
 * added later when we have a service-specific validation page variant.
 */
export const VALIDATION_PAGE_ELIGIBLE_TYPES: ReadonlySet<RecommendationType> = new Set([
  RECOMMENDATION_TYPES.BUILD_SOFTWARE,
]);

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Sliding TTL for Redis session state — 15 minutes */
export const SESSION_TTL_SECONDS = 900;

/** Redis key prefix for discovery sessions */
export const SESSION_KEY_PREFIX = 'discovery:session:';
