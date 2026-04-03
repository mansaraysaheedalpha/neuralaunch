// src/lib/discovery/client.ts
// Client-safe exports — contains NO server-only modules.
// UI components must import from this path, never from the root barrel.

export type { DiscoveryContext, DiscoveryContextField } from './context-schema';
export { DiscoveryContextSchema, createEmptyContext } from './context-schema';

export type { Recommendation } from './recommendation-schema';
export { RecommendationSchema } from './recommendation-schema';

export type { InterviewState } from './interview-engine';
export { createInterviewState, advance, applyUpdate, PHASE_FIELDS } from './interview-engine';

export { selectNextField, computeOverallCompleteness } from './question-selector';

export type { GuardResult } from './assumption-guard';
export { canSynthesise, evaluate } from './assumption-guard';

export {
  INTERVIEW_PHASES,
  MIN_FIELD_CONFIDENCE,
  SYNTHESIS_READINESS_RATIO,
  MAX_QUESTIONS_PER_PHASE,
  MAX_TOTAL_QUESTIONS,
  MODELS,
  SESSION_TTL_SECONDS,
  SESSION_KEY_PREFIX,
} from './constants';
export type { InterviewPhase } from './constants';
