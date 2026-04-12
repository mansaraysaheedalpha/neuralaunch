// src/lib/roadmap/coach/constants.ts
//
// Tunable knobs for the Conversation Coach. Every magic number
// that affects Coach behaviour lives here, never inline.

/**
 * Communication channels the Coach supports. Each channel produces
 * different output formatting (WhatsApp = short messages, email =
 * subject line + body, LinkedIn = character-constrained, in-person =
 * dialogue script).
 */
export const COACH_CHANNELS = ['whatsapp', 'in_person', 'email', 'linkedin'] as const;
export type CoachChannel = typeof COACH_CHANNELS[number];

/**
 * The internal tool identifier used in the suggestedTools array on
 * roadmap tasks. The roadmap generator writes this value; the task
 * card reads it to decide whether to show the Coach button.
 */
export const COACH_TOOL_ID = 'conversation_coach' as const;

/**
 * Hard cap on role-play turns. The founder and the AI each get one
 * message per turn, so 10 turns = 10 founder messages + 10 AI
 * responses. Warning fires at turn 8.
 */
export const ROLEPLAY_HARD_CAP_TURNS = 10;
export const ROLEPLAY_WARNING_TURN = 8;

/**
 * Maximum setup exchanges before the Coach forces a move to
 * preparation. Three exchanges is enough to collect who/what/fear/
 * channel even in the standalone path.
 */
export const SETUP_MAX_EXCHANGES = 3;
