// src/lib/discovery/interview-engine.ts
import {
  INTERVIEW_PHASES,
  InterviewPhase,
  MAX_QUESTIONS_PER_PHASE,
  MAX_TOTAL_QUESTIONS,
} from './constants';
import {
  DiscoveryContext,
  DiscoveryContextField,
  createEmptyContext,
} from './context-schema';
import { selectNextField } from './question-selector';
import { canSynthesise } from './assumption-guard';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface InterviewState {
  sessionId:        string;
  userId:           string;
  phase:            InterviewPhase;
  context:          DiscoveryContext;
  questionCount:    number;
  questionsInPhase: number;
  isComplete:       boolean;
  /** The field the engine is currently asking about — null between turns */
  activeField:      DiscoveryContextField | null;
  createdAt:        string;
  updatedAt:        string;
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
    phase:            INTERVIEW_PHASES.ORIENTATION,
    context:          createEmptyContext(),
    questionCount:    0,
    questionsInPhase: 0,
    isComplete:       false,
    activeField:      null,
    createdAt:        now,
    updatedAt:        now,
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
  nextField:       DiscoveryContextField | null;
  nextPhase:       InterviewPhase;
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

  const phaseFields   = PHASE_FIELDS[currentPhase];
  const phaseLimit    = MAX_QUESTIONS_PER_PHASE[currentPhase];
  const phaseExhausted = state.questionsInPhase >= phaseLimit;
  const nextField     = phaseExhausted ? null : selectNextField(state.context, phaseFields);

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
  const firstField      = selectNextField(state.context, nextPhaseFields);

  return { nextField: firstField, nextPhase, readyForSynthesis: false };
}

/**
 * Applies an extracted context update to the state and advances counters.
 * Returns a new state object — never mutates.
 */
export function applyUpdate(
  state:        InterviewState,
  updates:      Partial<DiscoveryContext>,
  phaseCrossed: boolean,
): InterviewState {
  const mergedContext = { ...state.context };

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

  const { nextField, nextPhase, readyForSynthesis } = advance({
    ...state,
    context:          mergedContext,
    questionsInPhase: phaseCrossed ? 0 : state.questionsInPhase + 1,
  });

  return {
    ...state,
    context:          mergedContext,
    phase:            nextPhase,
    questionCount:    state.questionCount + 1,
    questionsInPhase: phaseCrossed ? 1 : state.questionsInPhase + 1,
    isComplete:       readyForSynthesis,
    activeField:      nextField,
    updatedAt:        new Date().toISOString(),
  };
}

export { PHASE_FIELDS };
