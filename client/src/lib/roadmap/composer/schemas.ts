// src/lib/roadmap/composer/schemas.ts
//
// Zod schemas for every data shape the Outreach Composer produces
// and persists. Types are inferred from these schemas — never
// duplicated.

import { z } from 'zod';
import { COMPOSER_CHANNELS, COMPOSER_MODES, COMPOSER_TOOL_ID } from './constants';

// CLAUDE.md: .max() on LLM output strings causes AI_NoObjectGeneratedError.
// Use .transform() post-clamp instead.
function clampString(max: number) {
  return (raw: string): string => raw.length <= max ? raw : raw.slice(0, max - 1) + '\u2026';
}

// ---------------------------------------------------------------------------
// Context (collected in Step 1)
// ---------------------------------------------------------------------------

export const OutreachContextSchema = z.object({
  /** Who the founder is reaching out to (person or audience type). */
  targetDescription: z.string(),
  /** Specific recipient name for single/sequence mode. */
  recipientName:     z.string().optional(),
  /** Recipient's role or title. */
  recipientRole:     z.string().optional(),
  /** Relationship to the founder. */
  relationship:      z.string(),
  /** The specific goal of this outreach. */
  goal:              z.string(),
  /** Any prior interaction with the recipient. */
  priorInteraction:  z.string().optional(),
  /** Task description when launched from a task card. */
  taskContext:       z.string().optional(),
  /**
   * Coach handoff context — populated when the Composer was launched
   * from the Coach's post-conversation checklist. Carries what was
   * agreed in the conversation so the follow-up message references
   * the real outcome.
   */
  coachHandoffContext: z.object({
    conversationOutcome: z.string(),
    agreedTerms:         z.string().optional(),
    coachSessionId:      z.string(),
  }).optional(),
});
export type OutreachContext = z.infer<typeof OutreachContextSchema>;

// ---------------------------------------------------------------------------
// Output (produced in Step 2)
// ---------------------------------------------------------------------------

export const ComposerMessageSchema = z.object({
  /** Stable identifier for targeting regeneration and mark-sent. */
  id:                    z.string(),
  /** Recipient placeholder for batch mode (e.g. "[Restaurant Owner 1]"). */
  recipientPlaceholder:  z.string().optional(),
  /** Personalisation hook for batch mode. */
  personalisationHook:   z.string().optional(),
  /** Email subject line (email channel only). */
  subject:               z.string().transform(clampString(300)).optional(),
  /** The full message text — copy-paste ready. */
  body:                  z.string().transform(clampString(4000)),
  /** Brief "why this works" annotation the founder reads but doesn't send. */
  annotation:            z.string().transform(clampString(1000)),
  /** Recommended send timing for sequence mode (e.g. "Day 5"). */
  sendTiming:            z.string().optional(),
  /** Escalation note for sequence mode (e.g. "assumes no response to Day 1"). */
  escalationNote:        z.string().optional(),
  /**
   * Composer → Coach handoff. When the logical next step after a
   * response is a live conversation (meeting, call), the generation
   * agent sets this so the message card renders a "Prepare for this
   * conversation" link.
   */
  suggestedTool:         z.enum(['conversation_coach']).optional(),
  coachContext: z.object({
    recipientDetails:          z.string(),
    outreachContext:            z.string(),
    likelyConversationTopic:   z.string(),
  }).optional(),
  /** Regenerated variations (up to MAX_REGENERATIONS_PER_MESSAGE). */
  variations: z.array(z.object({
    body:                 z.string(),
    subject:              z.string().optional(),
    variationInstruction: z.string(),
  })).optional(),
});
export type ComposerMessage = z.infer<typeof ComposerMessageSchema>;

export const ComposerOutputSchema = z.object({
  messages: z.array(ComposerMessageSchema),
});
export type ComposerOutput = z.infer<typeof ComposerOutputSchema>;

// ---------------------------------------------------------------------------
// Session wrapper
// ---------------------------------------------------------------------------

export const ComposerSessionSchema = z.object({
  id:           z.string(),
  tool:         z.literal(COMPOSER_TOOL_ID),
  context:      OutreachContextSchema,
  mode:         z.enum(COMPOSER_MODES),
  channel:      z.enum(COMPOSER_CHANNELS),
  output:       ComposerOutputSchema.optional(),
  sentMessages: z.array(z.object({
    messageId: z.string(),
    sentAt:    z.string(),
  })).optional(),
  createdAt:    z.string(),
  updatedAt:    z.string(),
});
export type ComposerSession = z.infer<typeof ComposerSessionSchema>;

/**
 * Safely parse a composerSession from a task's passthrough JSONB.
 */
export function safeParseComposerSession(value: unknown): ComposerSession | null {
  const parsed = ComposerSessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
