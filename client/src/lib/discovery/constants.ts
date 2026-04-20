// src/lib/discovery/constants.ts
//
// Shared cross-app constants live in the @neuralaunch/constants
// workspace package — re-exported here so existing client imports
// (`import { RECOMMENDATION_TYPES } from '@/lib/discovery/constants'`)
// keep working without touching dozens of call sites. Server-only
// constants (model IDs, Inngest event names, Redis prefixes,
// validation-page eligibility) stay defined here because they have
// no place in the mobile bundle.

export {
  INTERVIEW_PHASES,
  type InterviewPhase,
  AUDIENCE_TYPES,
  type AudienceType,
  RECOMMENDATION_TYPES,
  type RecommendationType,
  PUSHBACK_CONFIG,
  PUSHBACK_ACTIONS,
  type PushbackAction,
  PUSHBACK_MODES,
  type PushbackMode,
} from '@neuralaunch/constants';

import {
  RECOMMENDATION_TYPES,
  type RecommendationType,
} from '@neuralaunch/constants';

// ---------------------------------------------------------------------------
// Confidence thresholds — server-only (interview engine internals)
// ---------------------------------------------------------------------------

/** Minimum per-field confidence to count a field as "known" */
export const MIN_FIELD_CONFIDENCE = 0.65;

/** Fraction of required fields that must be "known" before synthesis is allowed */
export const SYNTHESIS_READINESS_RATIO = 0.80;

/** Expected information gain threshold below which we stop asking and synthesise */
export const MIN_EXPECTED_GAIN_TO_CONTINUE = 0.05;

// ---------------------------------------------------------------------------
// Question limits — server-only
// ---------------------------------------------------------------------------

export const MAX_QUESTIONS_PER_PHASE: Record<
  'ORIENTATION' | 'GOAL_CLARITY' | 'CONSTRAINT_MAP' | 'CONVICTION',
  number
> = {
  ORIENTATION:    4,
  GOAL_CLARITY:   5,
  CONSTRAINT_MAP: 6,
  CONVICTION:     3,
};

/** Hard ceiling on total questions — prevents endless sessions */
export const MAX_TOTAL_QUESTIONS = 15;

// ---------------------------------------------------------------------------
// Model identifiers — server-only (model IDs do not belong in mobile bundle)
// ---------------------------------------------------------------------------

export const MODELS = {
  /** Used for question generation and context extraction (speed + cost) */
  INTERVIEW:  'claude-sonnet-4-6',
  /** Used for final synthesis only (depth + reasoning quality) */
  SYNTHESIS:  'claude-opus-4-6',
  /**
   * First fallback for question generation. Different infrastructure
   * from Sonnet so unlikely to be overloaded simultaneously. Capable
   * of producing interview questions at the quality required.
   * NEVER used for synthesis — synthesis surfaces failure instead.
   */
  INTERVIEW_FALLBACK_1: 'claude-haiku-4-5-20251001',
  /**
   * Second fallback for question generation. Google Gemini 2.5 Flash
   * via the @ai-sdk/google provider. Different vendor, so an Anthropic
   * regional outage cannot affect both fallback tiers. Same Vercel AI
   * SDK interface as Anthropic — no message-format translation needed.
   */
  INTERVIEW_FALLBACK_2: 'gemini-2.5-flash',
} as const;

/**
 * Maximum output tokens for question-generation streaming calls. A
 * single interview question never exceeds ~150 tokens; the cap exists
 * to bound time-to-first-token under load and reduce timeout exposure
 * when the API is degraded. Synthesis calls use their own ceilings
 * (typically 1024+) and ignore this constant.
 */
export const QUESTION_MAX_TOKENS = 1000;

// ---------------------------------------------------------------------------
// Inngest event name — server-only
// ---------------------------------------------------------------------------

/**
 * Inngest event name for the round-7 alternative-synthesis trigger.
 * Fires on the closing turn; the worker generates a constrained
 * recommendation built from the founder's stated alternative direction
 * and links it to the original via alternativeRecommendationId.
 */
export const PUSHBACK_ALTERNATIVE_EVENT = 'discovery/pushback.alternative.requested';

// ---------------------------------------------------------------------------
// Session — server-only (Redis key prefix, TTL)
// ---------------------------------------------------------------------------

/** Sliding TTL for Redis session state — 15 minutes */
export const SESSION_TTL_SECONDS = 900;

/** Redis key prefix for discovery sessions */
export const SESSION_KEY_PREFIX = 'discovery:session:';
