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
// Session
// ---------------------------------------------------------------------------

/** Sliding TTL for Redis session state — 15 minutes */
export const SESSION_TTL_SECONDS = 900;

/** Redis key prefix for discovery sessions */
export const SESSION_KEY_PREFIX = 'discovery:session:';
