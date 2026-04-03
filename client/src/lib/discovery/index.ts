// src/lib/discovery/index.ts
// Public API for the discovery module.
// Nothing outside this directory should import from internal files directly.

export type { DiscoveryContext, DiscoveryContextField } from './context-schema';
export { DiscoveryContextSchema, createEmptyContext } from './context-schema';

export type { Recommendation } from './recommendation-schema';
export { RecommendationSchema } from './recommendation-schema';

export type { InterviewState } from './interview-engine';
export { createInterviewState, advance, applyUpdate, PHASE_FIELDS } from './interview-engine';

export { selectNextField, computeOverallCompleteness } from './question-selector';

export type { GuardResult } from './assumption-guard';
export { canSynthesise, evaluate } from './assumption-guard';

export { runSynthesis } from './synthesis-engine';

export { getSession, saveSession, deleteSession } from './session-store';

export { extractContext } from './context-extractor';
export { generateQuestion } from './question-generator';
export { teeDiscoveryStream } from './stream-tee';

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
