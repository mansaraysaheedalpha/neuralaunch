// src/lib/validation/constants.ts

/**
 * VALIDATION_SYNTHESIS_THRESHOLDS
 *
 * Controls when the interpretation agent escalates from data collection
 * to build brief synthesis (the Opus-tier call). These are starting assumptions
 * based on pre-launch reasoning — adjust after first real pages produce data.
 *
 * MIN_VISITORS_FOR_BRIEF: below this, sample size is too small to commit to a
 * build direction. Lowering increases false confidence. Raising delays insight.
 *
 * MIN_FEATURE_CLICKS_FOR_BRIEF: below this, feature interest data is noise.
 * A single person clicking all features skews the ranking. Needs distribution
 * across at least this many clicks before the ranking is meaningful.
 *
 * MIN_SURVEY_RESPONSES_FOR_SYNTHESIS: below this, qualitative synthesis is
 * anecdote not signal. The agent should note survey themes but not weight them
 * heavily until this threshold is crossed.
 *
 * DAYS_BEFORE_LOW_TRAFFIC_WARNING: if MIN_VISITORS_FOR_BRIEF is not reached
 * within this window, the next action recommendation switches from "wait for
 * data" to "your traffic strategy needs attention — here is what to do."
 *
 * THRESHOLD_CHECK_INTERVAL_HOURS: how often Inngest polls for threshold
 * crossing between scheduled 24-hour runs. Lower = faster insight surfacing,
 * higher = fewer unnecessary DB reads.
 */
export const VALIDATION_SYNTHESIS_THRESHOLDS = {
  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  // !!  TEMPORARY — REVERT TO 50 BEFORE REAL TRAFFIC HITS THE   !!
  // !!  PRODUCT. Currently lowered to 5 ONLY to verify the      !!
  // !!  validation reporting Inngest function + BuildBriefPanel !!
  // !!  render path against the test data captured during the   !!
  // !!  first end-to-end Phase 3 production test on 2026-04-07. !!
  // !!                                                          !!
  // !!  Production value MUST be 50 — below that, the build     !!
  // !!  brief is statistical malpractice and would feed founders !!
  // !!  high-confidence recommendations off ~10 visitors.       !!
  // !!  See follow-up commit for the revert.                    !!
  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  MIN_VISITORS_FOR_BRIEF:             5,
  MIN_FEATURE_CLICKS_FOR_BRIEF:        5,
  MIN_SURVEY_RESPONSES_FOR_SYNTHESIS:  3,
  DAYS_BEFORE_LOW_TRAFFIC_WARNING:     4,
  THRESHOLD_CHECK_INTERVAL_HOURS:      6,
} as const;

/**
 * DISTRIBUTION_BRIEF_CONFIG
 *
 * Controls the distribution brief generated at publish time.
 *
 * CHANNEL_COUNT: number of channels surfaced. Three is the assumption —
 * enough to give options, few enough to be actionable. More than four
 * becomes a list the user ignores.
 *
 * MIN_GROUP_SIZE_FOR_RECOMMENDATION: do not recommend a channel unless it
 * is likely to have at least this many members. Prevents dead channel
 * recommendations.
 */
export const DISTRIBUTION_BRIEF_CONFIG = {
  CHANNEL_COUNT:                       3,
  MIN_GROUP_SIZE_FOR_RECOMMENDATION:  25,
} as const;

/**
 * VALIDATION_PAGE_CONFIG
 *
 * Controls page lifecycle behaviour.
 *
 * MAX_ACTIVE_DAYS: after this many days without a build brief generated,
 * the page is flagged for archival. Prevents indefinitely active pages with
 * no meaningful data consuming scheduled function runs.
 *
 * DRAFT_EXPIRY_HOURS: a draft page not published within this window is
 * automatically archived. Prevents ghost drafts accumulating in the DB.
 */
export const VALIDATION_PAGE_CONFIG = {
  MAX_ACTIVE_DAYS:     30,
  DRAFT_EXPIRY_HOURS:  72,
} as const;

/**
 * VALIDATION_EVENT
 *
 * Inngest event name for the validation page reporting function.
 */
export const VALIDATION_REPORTING_EVENT = 'validation/report.requested' as const;
export const VALIDATION_LIFECYCLE_EVENT = 'validation/lifecycle.check'  as const;

/**
 * LAYOUT_VARIANTS
 *
 * The three controlled layout templates. Selected automatically by the
 * page generation engine based on recommendation path category.
 * Never chosen by the user — consistent structure is what makes
 * analytics reliable across pages.
 */
export const LAYOUT_VARIANTS = {
  PRODUCT:     'product',     // software products, platforms, SaaS
  SERVICE:     'service',     // consulting, agencies, productised services
  MARKETPLACE: 'marketplace', // two-sided products, communities, directories
} as const;

export type LayoutVariant = typeof LAYOUT_VARIANTS[keyof typeof LAYOUT_VARIANTS];
