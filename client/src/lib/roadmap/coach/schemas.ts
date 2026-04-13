// src/lib/roadmap/coach/schemas.ts
//
// Zod schemas for every data shape the Conversation Coach produces
// and persists. These are the canonical source of truth — TypeScript
// types are inferred, never duplicated.
//
// The schemas are split into four groups matching the four stages:
//   1. Setup        — ConversationSetupSchema
//   2. Preparation  — PreparationPackageSchema (+ RolePlaySetupSchema)
//   3. Role-play    — RolePlayTurnSchema
//   4. Debrief      — DebriefSchema
//
// Plus the top-level CoachSessionSchema that wraps them all for
// persistence on the task or the roadmap toolSessions array.

import { z } from 'zod';
import { COACH_CHANNELS, COACH_TOOL_ID } from './constants';

// ---------------------------------------------------------------------------
// Stage 1 — Setup
// ---------------------------------------------------------------------------

export const ConversationSetupSchema = z.object({
  /** Who the founder is talking to — name, role, relationship. */
  who:          z.string(),
  /** The power dynamic and relationship history. */
  relationship: z.string(),
  /** The specific outcome the founder needs from this conversation. */
  objective:    z.string(),
  /** The specific fear stopping the founder from having the conversation. */
  fear:         z.string(),
  /** The communication channel for the conversation. */
  channel:      z.enum(COACH_CHANNELS),
  /** The originating task description, when launched from a task card. */
  taskContext:   z.string().optional(),
});
export type ConversationSetup = z.infer<typeof ConversationSetupSchema>;

// ---------------------------------------------------------------------------
// Stage 2 — Preparation
// ---------------------------------------------------------------------------

export const RolePlaySetupSchema = z.object({
  personality:        z.string(),
  motivations:        z.string(),
  probableConcerns:   z.array(z.string()),
  powerDynamic:       z.string(),
  communicationStyle: z.string(),
});
export type RolePlaySetup = z.infer<typeof RolePlaySetupSchema>;

export const PreparationPackageSchema = z.object({
  openingScript: z.string().describe(
    'The exact words to say or send to start the conversation. Formatted for the selected channel: WhatsApp = literal message to paste, in-person = first 30 seconds, email = subject line + body, LinkedIn = message-length.'
  ),
  keyAsks: z.array(z.object({
    ask:          z.string().describe('A concrete outcome to achieve in this conversation.'),
    whyItMatters: z.string().describe('Why this ask matters for the founder\'s goal.'),
  })).describe('2-3 specific things the founder needs to achieve.'),
  objections: z.array(z.object({
    objection:  z.string().describe('A likely pushback the other party will raise.'),
    response:   z.string().describe('The prepared response — grounded in the founder\'s context.'),
    groundedIn: z.string().describe('Which belief state field or context this response draws from.'),
  })).describe('3-4 most likely pushbacks with prepared responses.'),
  fallbackPositions: z.array(z.object({
    trigger:  z.string().describe('The condition that triggers this fallback (e.g. "if they say no to the trial").'),
    fallback: z.string().describe('The minimum acceptable outcome or alternative offer.'),
  })).describe('What to offer if the conversation goes badly.'),
  postConversationChecklist: z.array(z.object({
    condition: z.string().describe('The outcome that triggers this action (e.g. "if they agreed").'),
    action:    z.string().describe('The specific thing to do immediately after.'),
    /**
     * Coach → Composer handoff. When the checklist item involves
     * sending a follow-up message (e.g. "send a confirmation
     * WhatsApp within 2 hours"), the preparation agent sets this
     * so the checklist item renders a "Draft this message" button
     * that opens the Outreach Composer pre-loaded with the
     * conversation outcome context.
     */
    suggestedTool: z.enum(['outreach_composer']).optional().describe(
      'Set to outreach_composer when this checklist action involves sending a written follow-up message. The UI will render a "Draft this message" button that opens the Outreach Composer pre-loaded with context from this conversation.'
    ),
    composerContext: z.object({
      recipient:           z.string(),
      conversationOutcome: z.string(),
      agreedTerms:         z.string().optional(),
      channel:             z.enum(['whatsapp', 'email', 'linkedin']),
      messageGoal:         z.string(),
    }).optional().describe(
      'Pre-loaded context for the Outreach Composer. Only set when suggestedTool is outreach_composer. The Composer uses this to skip the context-collection step and generate the follow-up message immediately.'
    ),
  })).describe('3-5 specific post-conversation actions based on possible outcomes. When an action involves sending a written follow-up, set suggestedTool to outreach_composer and include composerContext so the founder can draft the message with one click.'),
  rolePlaySetup: RolePlaySetupSchema.describe(
    'Character sheet for the role-play: the other party\'s personality, motivations, concerns, power dynamic, and communication style.'
  ),
});
export type PreparationPackage = z.infer<typeof PreparationPackageSchema>;

// ---------------------------------------------------------------------------
// Stage 3 — Role-play
// ---------------------------------------------------------------------------

export const RolePlayTurnSchema = z.object({
  role:    z.enum(['founder', 'other_party']),
  message: z.string(),
  turn:    z.number().int().min(1),
});
export type RolePlayTurn = z.infer<typeof RolePlayTurnSchema>;

// ---------------------------------------------------------------------------
// Stage 4 — Debrief
// ---------------------------------------------------------------------------

export const DebriefSchema = z.object({
  whatWentWell:    z.array(z.string()).describe('Specific moments where the founder handled the conversation effectively.'),
  whatToWatchFor:  z.array(z.string()).describe('Moments where the founder hesitated or could improve — preparation notes, not criticism.'),
  revisedSections: z.object({
    openingScript:       z.string().optional().describe('Updated opening if the rehearsal surfaced a better one.'),
    additionalObjection: z.object({
      objection: z.string(),
      response:  z.string(),
    }).optional().describe('A new objection that emerged during rehearsal that the preparation missed.'),
  }).optional(),
});
export type Debrief = z.infer<typeof DebriefSchema>;

// ---------------------------------------------------------------------------
// Top-level session wrapper
// ---------------------------------------------------------------------------

/**
 * A complete Coach session. Persisted on the task as `coachSession`
 * (when launched from a task card) or inside `roadmap.toolSessions[]`
 * (when launched standalone).
 */
export const CoachSessionSchema = z.object({
  id:              z.string(),
  tool:            z.literal(COACH_TOOL_ID),
  setup:           ConversationSetupSchema,
  preparation:     PreparationPackageSchema.optional(),
  rolePlayHistory: z.array(RolePlayTurnSchema).optional(),
  debrief:         DebriefSchema.optional(),
  channel:         z.enum(COACH_CHANNELS),
  createdAt:       z.string(),
  updatedAt:       z.string(),
});
export type CoachSession = z.infer<typeof CoachSessionSchema>;

/**
 * The `toolSessions` array on the Roadmap row. Each entry has a
 * `tool` discriminator ('conversation_coach', 'outreach_composer',
 * future tools). We use a permissive base schema with passthrough
 * so entries from different tools can coexist in the same array
 * without one tool's strict schema rejecting another's entries.
 * Individual entries are validated by their own module's schema
 * (CoachSessionSchema, ComposerSessionSchema) when accessed.
 */
const ToolSessionEntrySchema = z.object({
  id:   z.string(),
  tool: z.string(),
}).passthrough();

export const ToolSessionsArraySchema = z.array(ToolSessionEntrySchema);
export type ToolSessions = z.infer<typeof ToolSessionsArraySchema>;

/**
 * Safely parse a Roadmap.toolSessions JSONB value. Returns an empty
 * array on parse failure so the caller can proceed without crash.
 */
export function safeParseToolSessions(value: unknown): ToolSessions {
  const parsed = ToolSessionsArraySchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}
