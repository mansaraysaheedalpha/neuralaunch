// src/lib/roadmap/composer/constants.ts
//
// Tunable knobs for the Outreach Composer.

/**
 * Communication channels the Composer supports. Same as the Coach
 * but without in_person — the Composer produces written messages only.
 */
export const COMPOSER_CHANNELS = ['whatsapp', 'email', 'linkedin'] as const;
export type ComposerChannel = typeof COMPOSER_CHANNELS[number];

/**
 * The three generation modes.
 *   single   — one message to one specific person
 *   batch    — 5-10 personalised messages to similar people
 *   sequence — Day 1 / Day 5 / Day 14 follow-up sequence
 */
export const COMPOSER_MODES = ['single', 'batch', 'sequence'] as const;
export type ComposerMode = typeof COMPOSER_MODES[number];

/**
 * The internal tool identifier used in suggestedTools on roadmap tasks.
 */
export const COMPOSER_TOOL_ID = 'outreach_composer' as const;

/**
 * Hard cap on regenerations per message. The founder gets 3 total
 * versions: the original + 2 variations.
 */
export const MAX_REGENERATIONS_PER_MESSAGE = 2;

/**
 * Maximum context-collection exchanges before moving to generation.
 */
export const CONTEXT_MAX_EXCHANGES = 2;
