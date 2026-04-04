// src/lib/discovery/interview-engine.ts
import type { AudienceType } from './constants';
import {
  INTERVIEW_PHASES,
  InterviewPhase,
  MAX_TOTAL_QUESTIONS,
} from './constants';
import {
  DiscoveryContext,
  DiscoveryContextField,
  createEmptyContext,
} from './context-schema';
import { detectsPsychBlocker, selectNextField } from './question-selector';
import { canSynthesise } from './assumption-guard';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface InterviewState {
  sessionId:             string;
  userId:                string;
  phase:                 InterviewPhase;
  context:               DiscoveryContext;
  questionCount:         number;
  questionsInPhase:      number;
  isComplete:            boolean;
  /** The field the engine is currently asking about — null between turns */
  activeField:           DiscoveryContextField | 'psych_probe' | null;
  /** Audience type, classified silently after 2nd exchange */
  audienceType:          AudienceType | null;
  /** Number of consecutive extraction misses on the current field. Resets to 0 on any successful extraction. */
  consecutiveMisses:     number;
  /** True once a psych probe question has been asked — ensures it fires at most once */
  psychConstraintProbed: boolean;
  /** True once a pricing-history follow-up has been asked — ensures it fires at most once */
  pricingProbed:         boolean;
  /** Every field the engine has generated a question for — deterministic repeat-prevention */
  askedFields:           DiscoveryContextField[];
  createdAt:             string;
  updatedAt:             string;
}

// ---------------------------------------------------------------------------
// Phase → required fields mapping
// ---------------------------------------------------------------------------

const PHASE_FIELDS: Record<Exclude<InterviewPhase, 'SYNTHESIS'>, DiscoveryContextField[]> = {
  ORIENTATION: [
    'situation',
    'background',
    'whatTriedBefore',
  ],
  GOAL_CLARITY: [
    'primaryGoal',
    'successDefinition',
    'timeHorizon',
  ],
  CONSTRAINT_MAP: [
    'availableTimePerWeek',
    'availableBudget',
    'teamSize',
    'technicalAbility',
    'geographicMarket',
  ],
  CONVICTION: [
    'commitmentLevel',
    'biggestConcern',
    'whyNow',
  ],
};

const PHASE_ORDER: InterviewPhase[] = [
  INTERVIEW_PHASES.ORIENTATION,
  INTERVIEW_PHASES.GOAL_CLARITY,
  INTERVIEW_PHASES.CONSTRAINT_MAP,
  INTERVIEW_PHASES.CONVICTION,
  INTERVIEW_PHASES.SYNTHESIS,
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a fresh interview state for a new session.
 */
export function createInterviewState(sessionId: string, userId: string): InterviewState {
  const now = new Date().toISOString();
  return {
    sessionId,
    userId,
    phase:                 INTERVIEW_PHASES.ORIENTATION,
    context:               createEmptyContext(),
    questionCount:         0,
    questionsInPhase:      0,
    isComplete:            false,
    activeField:           null,
    audienceType:          null,
    consecutiveMisses:     0,
    psychConstraintProbed: false,
    pricingProbed:         false,
    askedFields:           [],
    createdAt:             now,
    updatedAt:             now,
  };
}

// ---------------------------------------------------------------------------
// Transition logic
// ---------------------------------------------------------------------------

/**
 * Given the current state, decides what to do next:
 * - Return the next field to ask about, OR
 * - Advance to the next phase, OR
 * - Mark the session as ready for synthesis
 */
export function advance(state: InterviewState): {
  nextField:         DiscoveryContextField | 'psych_probe' | null;
  nextPhase:         InterviewPhase;
  readyForSynthesis: boolean;
} {
  // Hard ceiling — never ask more than the maximum
  if (state.questionCount >= MAX_TOTAL_QUESTIONS) {
    return { nextField: null, nextPhase: INTERVIEW_PHASES.SYNTHESIS, readyForSynthesis: true };
  }

  // Synthesis readiness check takes priority
  if (canSynthesise(state.context)) {
    return { nextField: null, nextPhase: INTERVIEW_PHASES.SYNTHESIS, readyForSynthesis: true };
  }

  const currentPhase = state.phase;

  if (currentPhase === INTERVIEW_PHASES.SYNTHESIS) {
    return { nextField: null, nextPhase: INTERVIEW_PHASES.SYNTHESIS, readyForSynthesis: true };
  }

  // Inject psychological probe once if a motivational blocker is detected
  if (!state.psychConstraintProbed && detectsPsychBlocker(state.context)) {
    return { nextField: 'psych_probe', nextPhase: currentPhase, readyForSynthesis: false };
  }

  // Phase ends when selectNextField finds no more fields worth asking about —
  // i.e. all fields in this phase are above the confidence threshold.
  // No per-phase hard cap: a verbose user exits early, a terse user stays longer.
  const phaseFields = PHASE_FIELDS[currentPhase];
  const nextField   = selectNextField(state.context, phaseFields, state.audienceType ?? undefined);

  if (nextField !== null) {
    return { nextField, nextPhase: currentPhase, readyForSynthesis: false };
  }

  // Current phase is done — advance to the next one
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  const nextPhase    = PHASE_ORDER[currentIndex + 1] ?? INTERVIEW_PHASES.SYNTHESIS;

  if (nextPhase === INTERVIEW_PHASES.SYNTHESIS) {
    return { nextField: null, nextPhase, readyForSynthesis: true };
  }

  const nextPhaseFields = PHASE_FIELDS[nextPhase];
  const firstField      = selectNextField(
    state.context, nextPhaseFields, state.audienceType ?? undefined,
  );

  return { nextField: firstField, nextPhase, readyForSynthesis: false };
}

/**
 * Applies an extracted context update to the state and advances counters.
 * Returns a new state object — never mutates.
 */
export function applyUpdate(
  state:   InterviewState,
  updates: Partial<DiscoveryContext>,
): InterviewState {
  const mergedContext = { ...state.context };
  const wasPsychProbe = state.activeField === 'psych_probe';

  for (const key of Object.keys(updates) as DiscoveryContextField[]) {
    const incoming = updates[key];
    if (incoming !== undefined) {
      const existing = mergedContext[key];
      // Only overwrite if incoming confidence is higher
      if (incoming.confidence > existing.confidence) {
        (mergedContext as Record<string, unknown>)[key] = {
          ...incoming,
          extractedAt: new Date().toISOString(),
        };
      }
    }
  }

  const psychConstraintProbed = wasPsychProbe ? true : state.psychConstraintProbed;

  // Record every real field the engine has asked about — deterministic, never inferred.
  // psych_probe is excluded: it doesn't correspond to a DiscoveryContextField.
  const askedFields: DiscoveryContextField[] = wasPsychProbe
    ? state.askedFields
    : state.activeField && !state.askedFields.includes(state.activeField as DiscoveryContextField)
      ? [...state.askedFields, state.activeField as DiscoveryContextField]
      : state.askedFields;

  const { nextField, nextPhase, readyForSynthesis } = advance({
    ...state,
    context:               mergedContext,
    questionsInPhase:      state.questionsInPhase + 1,
    psychConstraintProbed,
  });

  const phaseChanged       = nextPhase !== state.phase;
  const nextQuestionsInPhase = phaseChanged ? 1 : state.questionsInPhase + 1;

  return {
    ...state,
    context:               mergedContext,
    phase:                 nextPhase,
    questionCount:         state.questionCount + 1,
    questionsInPhase:      nextQuestionsInPhase,
    isComplete:            readyForSynthesis,
    activeField:           nextField,
    consecutiveMisses:     0,
    psychConstraintProbed,
    askedFields,
    updatedAt:             new Date().toISOString(),
  };
}

export { PHASE_FIELDS };
