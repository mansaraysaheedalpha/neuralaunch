// src/lib/outcome/outcome-types.ts
import { z } from 'zod';

/**
 * Concern 5 — Outcome capture
 *
 * Single source of truth for the outcome enum and its UI metadata.
 * The DB column is a free string so adding a fifth bucket later is
 * a code-only change; this enum is what every read/write path
 * actually uses.
 *
 * Per the deliberation, the language is chosen to honour the
 * founder's effort regardless of result. did_not_work is framed
 * as "I took a different path" to avoid making the founder feel
 * accused of failure. The free-text prompt for that bucket asks
 * a diagnostic question, not a confessional one.
 */
export const OUTCOME_TYPES = {
  FULL_SUCCESS:   'full_success',
  PARTIAL_SUCCESS: 'partial_success',
  DIRECTION_CORRECT: 'direction_correct_execution_different',
  DID_NOT_WORK:   'did_not_work',
} as const;

export type OutcomeType = typeof OUTCOME_TYPES[keyof typeof OUTCOME_TYPES];

export const OUTCOME_TYPE_VALUES: readonly OutcomeType[] = [
  OUTCOME_TYPES.FULL_SUCCESS,
  OUTCOME_TYPES.PARTIAL_SUCCESS,
  OUTCOME_TYPES.DIRECTION_CORRECT,
  OUTCOME_TYPES.DID_NOT_WORK,
];

export interface OutcomeCopy {
  /** Title shown in the radio-card list. Honours the effort. */
  cardTitle:    string;
  /** One-line description shown beneath the title. */
  cardSubtitle: string;
  /** Placeholder for the free-text field when this option is selected. */
  freeTextPrompt: string;
  /** Whether the free-text field is required. did_not_work is required because diagnostic. */
  freeTextRequired: boolean;
  /** Whether to show the "which phases needed adjustment" follow-up. */
  showWeakPhasesFollowup: boolean;
}

export const OUTCOME_COPY: Record<OutcomeType, OutcomeCopy> = {
  [OUTCOME_TYPES.FULL_SUCCESS]: {
    cardTitle:    'It worked as described',
    cardSubtitle: 'I followed the recommendation and reached what I set out to do.',
    freeTextPrompt: 'Anything worth noting about how it went? (optional)',
    freeTextRequired: false,
    showWeakPhasesFollowup: false,
  },
  [OUTCOME_TYPES.PARTIAL_SUCCESS]: {
    cardTitle:    'Mostly the right path, with adaptation',
    cardSubtitle: 'It got me most of the way there but I had to adapt significantly along the way.',
    freeTextPrompt: 'What did you have to adapt? (optional)',
    freeTextRequired: false,
    showWeakPhasesFollowup: true,
  },
  [OUTCOME_TYPES.DIRECTION_CORRECT]: {
    cardTitle:    'Right direction, different execution',
    cardSubtitle: 'The path was right but the specific steps needed more adjustment than the roadmap anticipated.',
    freeTextPrompt: 'What changed about how you actually executed it? (optional)',
    freeTextRequired: false,
    showWeakPhasesFollowup: true,
  },
  [OUTCOME_TYPES.DID_NOT_WORK]: {
    cardTitle:    'I took a different path — and here is what I learned',
    cardSubtitle: 'The recommendation was not right for my situation. I went somewhere else.',
    // Diagnostic, not confessional. Asking the founder to diagnose
    // the gap, not report failure.
    freeTextPrompt: 'What would have made this recommendation more accurate for your situation?',
    freeTextRequired: true,
    showWeakPhasesFollowup: false,
  },
};

// ---------------------------------------------------------------------------
// Submission body schema
// ---------------------------------------------------------------------------

export const OutcomeSubmissionSchema = z.object({
  outcomeType: z.enum([
    OUTCOME_TYPES.FULL_SUCCESS,
    OUTCOME_TYPES.PARTIAL_SUCCESS,
    OUTCOME_TYPES.DIRECTION_CORRECT,
    OUTCOME_TYPES.DID_NOT_WORK,
  ]),
  freeText:   z.string().max(4000).optional(),
  weakPhases: z.array(z.string().max(200)).max(10).default([]),
  /**
   * The current value of the founder's training-consent setting at
   * the moment of submission. Sent from the client so the server
   * has a single read of the consent state without a database trip.
   * Server-side validation cross-checks against the user row.
   */
  consentedToTraining: z.boolean(),
});
export type OutcomeSubmission = z.infer<typeof OutcomeSubmissionSchema>;
