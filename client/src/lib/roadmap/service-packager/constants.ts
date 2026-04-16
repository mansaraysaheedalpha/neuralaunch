// src/lib/roadmap/service-packager/constants.ts
//
// Tunable knobs for the Service Packager. Every magic number that
// affects Packager behaviour lives here, never inline.

/**
 * The internal tool identifier used in the suggestedTools array on
 * roadmap tasks. The roadmap generator writes this value; the task
 * card reads it to decide whether to show the Packager button.
 */
export const PACKAGER_TOOL_ID = 'service_packager' as const;

/**
 * Output format for the one-page service brief. The founder picks
 * their preferred channel during context confirmation; the generation
 * agent adapts the brief format accordingly.
 *
 *   whatsapp — short, paste-ready message structured for WhatsApp
 *   document — clean one-pager for email or print
 */
export const PACKAGER_BRIEF_FORMATS = ['whatsapp', 'document'] as const;
export type PackagerBriefFormat = typeof PACKAGER_BRIEF_FORMATS[number];

/**
 * Hard cap on adjustment rounds. The founder gets the original package
 * plus three adjustments (for a total of four versions). Cap enforced
 * by the API route, not the engine.
 */
export const MAX_ADJUSTMENT_ROUNDS = 3;

/**
 * Maximum context-confirmation exchanges before moving to generation.
 * From a task card this is almost always 1 (pre-populated summary →
 * "looks right"). Standalone sessions get one exchange to describe
 * the service, then generation.
 */
export const CONTEXT_MAX_EXCHANGES = 2;
