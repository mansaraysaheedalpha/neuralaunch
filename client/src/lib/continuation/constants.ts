// src/lib/continuation/constants.ts
//
// Roadmap Continuation feature constants. See docs/ROADMAP_CONTINUATION.md
// for the full spec — every magic number that drives a behavioural
// branch in the continuation engine lives here, never inline.

/**
 * Inngest event name for the durable continuation brief generation.
 * Fired by the checkpoint route when Scenario C or D applies (or by
 * the diagnostic agent when it releases a Scenario A/B founder).
 *
 * Consumer: continuationBriefFunction in
 * src/inngest/functions/continuation-brief-function.ts (Phase 3).
 */
export const CONTINUATION_BRIEF_EVENT = 'discovery/continuation.requested' as const;

/**
 * Scenario thresholds for the "What's Next?" checkpoint.
 *
 * Spec maps progress to one of four scenarios:
 *   A — zero tasks completed → diagnostic mode (zero-progress blocker)
 *   B — partial completion < PARTIAL_TO_BRIEF_RATIO → diagnostic mode (incomplete-reason inquiry)
 *   C — partial completion ≥ PARTIAL_TO_BRIEF_RATIO → full continuation brief
 *   D — 100% completion → full continuation brief (cleanest path)
 *
 * The 70% cutover comes directly from the spec — generating an
 * expensive Opus brief on a half-complete roadmap risks producing a
 * thin "What Happened" section grounded in too little evidence.
 */
export const CONTINUATION_THRESHOLDS = {
  /** At or above this ratio, the brief generates without diagnostic chat. */
  PARTIAL_TO_BRIEF_RATIO: 0.70,
} as const;

/**
 * Hard cap on parking-lot items per roadmap. Bounds JSONB column size
 * (the brief renderer reads the entire array on every continuation
 * call) and protects against runaway agent or manual additions.
 *
 * The signal of the parking lot lives in the first dozen items —
 * after fifty, the founder will not act on any of them anyway.
 */
export const PARKING_LOT_MAX_ITEMS = 50;

/**
 * Hard cap on diagnostic chat turns per roadmap. The diagnostic is
 * meant to be 2-4 rounds — if the founder needs more than this, they
 * should start a fresh discovery session, not continue chatting in
 * a context-thin diagnostic surface.
 */
export const DIAGNOSTIC_HARD_CAP_TURNS = 6;

/**
 * Lifecycle states the continuation flow walks through. Stored on
 * Roadmap.continuationStatus as a TEXT column rather than an enum
 * because the values are scoped to one feature and an enum migration
 * for a six-state lifecycle is needless ceremony.
 *
 * Valid transitions:
 *   null → CHECKING (founder hits "What's Next?")
 *   CHECKING → DIAGNOSING        (Scenario A or B)
 *   CHECKING → GENERATING_BRIEF  (Scenario C or D)
 *   DIAGNOSING → GENERATING_BRIEF (diagnostic agent releases)
 *   GENERATING_BRIEF → BRIEF_READY (Inngest function persists)
 *   BRIEF_READY → FORK_SELECTED  (founder picks a fork)
 *   FORK_SELECTED → null         (next-cycle roadmap takes over; this row stays as ancestry)
 */
export const CONTINUATION_STATUSES = {
  CHECKING:         'CHECKING',
  DIAGNOSING:       'DIAGNOSING',
  GENERATING_BRIEF: 'GENERATING_BRIEF',
  BRIEF_READY:      'BRIEF_READY',
  FORK_SELECTED:    'FORK_SELECTED',
} as const;

export type ContinuationStatus = typeof CONTINUATION_STATUSES[keyof typeof CONTINUATION_STATUSES];

/**
 * Maximum length of an idea string in the parking lot. Long enough
 * to capture an idea phrase, short enough to keep the JSONB column
 * lean. Trimmed at write time both server- and client-side.
 */
export const PARKING_LOT_IDEA_MAX_LENGTH = 280;
