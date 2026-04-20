/**
 * Discovery domain constants — shared between client (interview engine,
 * synthesis, pushback, validation gating) and mobile (recommendation
 * reveal, pushback chat, audience-aware copy).
 *
 * These are the literal values that both apps must agree on. If mobile
 * ever needs to render a recommendation type label, route on a pushback
 * action, or check that an audience-classification value is valid,
 * those checks must reference the same enum source as the client's
 * Zod schemas — that's this file.
 */

// ---------------------------------------------------------------------------
// Interview phase progression — do not reorder
// ---------------------------------------------------------------------------

export const INTERVIEW_PHASES = {
  ORIENTATION:    'ORIENTATION',
  GOAL_CLARITY:   'GOAL_CLARITY',
  CONSTRAINT_MAP: 'CONSTRAINT_MAP',
  CONVICTION:     'CONVICTION',
  SYNTHESIS:      'SYNTHESIS',
} as const;

export type InterviewPhase = typeof INTERVIEW_PHASES[keyof typeof INTERVIEW_PHASES];

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

// ---------------------------------------------------------------------------
// Pushback / acceptance tuning
// ---------------------------------------------------------------------------

/**
 * Tier-aware config so the round caps can be lifted at payment integration
 * with a single config change rather than a code refactor.
 *
 * The agent fires the soft re-frame at SOFT_WARN_ROUND when the dialogue
 * has stalled (model self-reports `converging: false`). The hard cap at
 * HARD_CAP_ROUND triggers the closing move + alternative-synthesis on
 * the same turn — there is no eighth attempt.
 */
export const PUSHBACK_CONFIG = {
  /** Round at which the agent should consider injecting a re-frame, IF stalled. */
  SOFT_WARN_ROUND: 4,
  /**
   * Final user round — the agent's response on this round is the
   * closing move. Per-tier because paying users deserve more room
   * to converge on a complex recommendation; free users don't reach
   * pushback at all.
   *
   *   execute:  10 rounds — production feedback showed 7 frequently
   *             cut off productive conversations mid-convergence
   *             (2026-04-21 testing incident).
   *   compound: 15 rounds — higher cap for the power tier; matches
   *             the "the system gets smarter" positioning.
   *
   * HARD_CAP_ROUND is preserved as a default for back-compat with
   * pre-tier-aware call sites (e.g. server-only defaults). Route
   * handlers should prefer `hardCapForTier(tier)` going forward.
   */
  HARD_CAP_ROUND:  10,
  HARD_CAP_BY_TIER: {
    execute:  10,
    compound: 15,
  },
} as const;

/**
 * Resolve the pushback hard cap for a given billing tier. Returns
 * HARD_CAP_BY_TIER.execute for any unknown / free tier — the server
 * route gates pushback to paid tiers anyway, so this never lies to
 * a real caller; it just prevents a bad tier string from crashing
 * the cap arithmetic.
 */
export function hardCapForTier(tier: string): number {
  if (tier === 'compound') return PUSHBACK_CONFIG.HARD_CAP_BY_TIER.compound;
  return PUSHBACK_CONFIG.HARD_CAP_BY_TIER.execute;
}

/** Action labels emitted by the pushback agent in its structured response. */
export const PUSHBACK_ACTIONS = {
  CONTINUE_DIALOGUE: 'continue_dialogue',
  DEFEND:            'defend',
  REFINE:            'refine',
  REPLACE:           'replace',
  CLOSING:           'closing',
} as const;
export type PushbackAction = typeof PUSHBACK_ACTIONS[keyof typeof PUSHBACK_ACTIONS];

/** Mode the agent identifies in the founder's pushback before responding. */
export const PUSHBACK_MODES = {
  ANALYTICAL:     'analytical',
  FEAR:           'fear',
  LACK_OF_BELIEF: 'lack_of_belief',
} as const;
export type PushbackMode = typeof PUSHBACK_MODES[keyof typeof PUSHBACK_MODES];
