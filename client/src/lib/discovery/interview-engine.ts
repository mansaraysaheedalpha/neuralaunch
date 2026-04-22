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
import {
  detectsPsychBlocker,
  selectNextField,
  selectFallbackField,
} from './question-selector';
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
  /** The field the engine is currently asking about — null between turns.
   *  Special values: 'psych_probe' (motivational probe), 'follow_up'
   *  (user-initiated thread escalation). */
  activeField:           DiscoveryContextField | 'psych_probe' | 'follow_up' | null;
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
  /**
   * A user-initiated thread detected by the extractor that should be
   * probed as a follow-up BEFORE the next scored field. Set when the
   * user mentions a competitor, market condition, or strategic insight
   * unprompted. Consumed once by advance() then cleared.
   */
  pendingFollowUp:       { topic: string } | null;
  /**
   * questionCount at which the most recent follow-up fired. Used by
   * the turn route to enforce a cooldown before arming another
   * follow-up — without this, emotionally-rich answers keep flagging
   * follow-up-worthy topics every turn and the engine loops on the
   * same emotional thread (2026-04-22 Amara test: same "what's your
   * deeper fear" question surfaced three times in a row because each
   * rich answer re-armed pendingFollowUp).
   */
  lastFollowUpAtQuestion: number | null;
  /**
   * Topics from the last N follow-ups (newest first). Used by the
   * turn route to deduplicate — if the extractor flags a new topic
   * that overlaps significantly with one already probed, we skip
   * arming pendingFollowUp. Cap at 3 entries; older topics roll off.
   */
  recentFollowUpTopics:   string[];
  /**
   * Lifecycle memory fields — persisted in Redis so the turn route
   * can load the right context on each turn without requiring the
   * client to re-send scenario info. Only small strings are stored;
   * the actual FounderProfile + CycleSummaries are loaded fresh from
   * the DB on each turn via the context loaders.
   */
  lifecycleScenario?:    'fresh_start' | 'fork_continuation' | 'first_interview';
  ventureId?:            string;
  forkContext?:           string;
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
    'motivationAnchor',
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
 * Creates a fresh interview state for a new session. Accepts an
 * optional lifecycle scenario so the turn route can load the right
 * context (FounderProfile + CycleSummaries) on each subsequent turn.
 */
export function createInterviewState(
  sessionId: string,
  userId:    string,
  lifecycle?: {
    scenario:     'fresh_start' | 'fork_continuation' | 'first_interview';
    ventureId?:   string;
    forkContext?:  string;
  },
): InterviewState {
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
    pendingFollowUp:       null,
    lastFollowUpAtQuestion: null,
    recentFollowUpTopics:   [],
    lifecycleScenario:     lifecycle?.scenario,
    ventureId:             lifecycle?.ventureId,
    forkContext:            lifecycle?.forkContext,
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
  nextField:         DiscoveryContextField | 'psych_probe' | 'follow_up' | null;
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

  // User-initiated thread follow-up — fires BEFORE the next scored
  // field. This is the structural mechanism (not just a prompt hint)
  // that ensures user-raised topics like competitor mentions, market
  // conditions, or strategic insights get a dedicated question slot
  // instead of being buried by the next highest-scoring field.
  // Same pattern as psych_probe: a one-time injection consumed once.
  if (state.pendingFollowUp) {
    return { nextField: 'follow_up', nextPhase: currentPhase, readyForSynthesis: false };
  }

  // Inject psychological probe once if a motivational blocker is detected
  if (!state.psychConstraintProbed && detectsPsychBlocker(state.context)) {
    return { nextField: 'psych_probe', nextPhase: currentPhase, readyForSynthesis: false };
  }

  // Only schedule fields that haven't been asked yet — prevents the engine from
  // rescheduling a field with low extraction confidence indefinitely. Each field is
  // asked at most once; the consecutiveMisses mechanism handles re-asks for extraction
  // misses. If all phase fields have been asked, fall through to phase transition.
  const phaseFields   = PHASE_FIELDS[currentPhase];
  const unaskedFields = phaseFields.filter(f => !state.askedFields.includes(f));
  const nextField     = selectNextField(state.context, unaskedFields, state.audienceType ?? undefined);

  if (nextField !== null) {
    return { nextField, nextPhase: currentPhase, readyForSynthesis: false };
  }

  // Current phase is done (all fields asked OR all above confidence threshold) — advance
  const currentIndex      = PHASE_ORDER.indexOf(currentPhase);
  const nextPhaseCandidate = PHASE_ORDER[currentIndex + 1];

  if (nextPhaseCandidate && nextPhaseCandidate !== INTERVIEW_PHASES.SYNTHESIS) {
    const nextPhaseFields  = PHASE_FIELDS[nextPhaseCandidate];
    const unaskedNextPhase = nextPhaseFields.filter(f => !state.askedFields.includes(f));
    const firstField       = selectNextField(
      state.context, unaskedNextPhase, state.audienceType ?? undefined,
    );
    if (firstField !== null) {
      return { nextField: firstField, nextPhase: nextPhaseCandidate, readyForSynthesis: false };
    }
  }

  // Normal phase-driven selection found nothing to ask AND canSynthesise()
  // above returned false. This happens most often when a rich opening
  // monologue extracts many fields at 0.5-0.7 confidence — the phase
  // selector skips them (auto-asked) but the synthesis guard still fails
  // (critical fields under-probed, or overall completeness too low).
  //
  // Falling back into synthesis here is the bug that shipped short
  // interviews with sparse recommendations. Instead, pull the
  // lowest-confidence critical field across any phase and ask it
  // explicitly. Only commit to synthesis when selectFallbackField also
  // returns null — meaning every field is at or above STRONG_CONFIDENCE
  // and there is genuinely nothing left to probe.
  const fallback = selectFallbackField(state.context, state.audienceType ?? undefined);
  if (fallback !== null) {
    return { nextField: fallback, nextPhase: currentPhase, readyForSynthesis: false };
  }

  return { nextField: null, nextPhase: INTERVIEW_PHASES.SYNTHESIS, readyForSynthesis: true };
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

  // Record every field that now has meaningful data as "covered."
  //
  // ARCHITECTURE FIX: The original code only added the activeField to
  // askedFields. With multi-field extraction, the user may have mentioned
  // 3-4 fields in a single answer. ALL of those fields must be marked
  // as covered so the question selector doesn't re-ask for them.
  //
  // We mark a field as covered when:
  //   1. It was the activeField (the engine asked about it), OR
  //   2. It was extracted from the user's message with confidence above
  //      the minimum threshold (the user volunteered it unprompted)
  //
  // psych_probe is excluded: it doesn't correspond to a DiscoveryContextField.
  const coveredFromExtraction = Object.keys(updates)
    .filter((k): k is DiscoveryContextField => {
      const field = k as DiscoveryContextField;
      const incoming = updates[field];
      return incoming !== undefined && incoming.confidence >= 0.5;
    });

  let askedFields = [...state.askedFields];
  // Add the active field (if real and not already tracked). Skip
  // 'psych_probe' and 'follow_up' — they are pseudo-fields, not real
  // DiscoveryContextField values, and pushing the literal string
  // would pollute askedFields with a value that never matches any
  // real field when advance() filters candidates.
  if (
    state.activeField &&
    state.activeField !== 'psych_probe' &&
    state.activeField !== 'follow_up'
  ) {
    const af = state.activeField;
    if (!askedFields.includes(af)) askedFields.push(af);
  }
  // Add all fields that were extracted from this message
  for (const field of coveredFromExtraction) {
    if (!askedFields.includes(field)) askedFields.push(field);
  }

  const { nextField, nextPhase, readyForSynthesis } = advance({
    ...state,
    context:               mergedContext,
    questionsInPhase:      state.questionsInPhase + 1,
    psychConstraintProbed,
    askedFields, // updated list — must include the current field before advance() filters candidates
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
