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

import { z } from "zod";
import { COACH_CHANNELS, COACH_TOOL_ID } from "./constants";
import { PreparationPackageSchema } from "./preparation-schema";
import { DebriefSchema } from "./debrief-schema";
export {
  PreparationPackageSchema,
  RolePlaySetupSchema,
  type PreparationPackage,
  type RolePlaySetup,
} from "./preparation-schema";
export { DebriefSchema, type Debrief } from "./debrief-schema";

// ---------------------------------------------------------------------------
// Stage 1 — Setup
// ---------------------------------------------------------------------------

export const ConversationSetupSchema = z.object({
  /** Who the founder is talking to — name, role, relationship. */
  who: z.string(),
  /** The power dynamic and relationship history. */
  relationship: z.string(),
  /** The specific outcome the founder needs from this conversation. */
  objective: z.string(),
  /** The specific fear stopping the founder from having the conversation. */
  fear: z.string(),
  /** The communication channel for the conversation. */
  channel: z.enum(COACH_CHANNELS),
  /** The originating task description, when launched from a task card. */
  taskContext: z.string().optional(),
});
export type ConversationSetup = z.infer<typeof ConversationSetupSchema>;

// ---------------------------------------------------------------------------
// Stage 3 — Role-play
// ---------------------------------------------------------------------------

export const RolePlayTurnSchema = z.object({
  role: z.enum(["founder", "other_party"]),
  message: z.string(),
  turn: z.number().int().min(1),
});
export type RolePlayTurn = z.infer<typeof RolePlayTurnSchema>;

// ---------------------------------------------------------------------------
// Top-level session wrapper
// ---------------------------------------------------------------------------

/**
 * A complete Coach session. Persisted on the task as `coachSession`
 * (when launched from a task card) or inside `roadmap.toolSessions[]`
 * (when launched standalone).
 */
export const CoachSessionSchema = z.object({
  id: z.string(),
  tool: z.literal(COACH_TOOL_ID),
  setup: ConversationSetupSchema,
  preparation: PreparationPackageSchema.optional(),
  rolePlayHistory: z.array(RolePlayTurnSchema).optional(),
  debrief: DebriefSchema.optional(),
  channel: z.enum(COACH_CHANNELS),
  createdAt: z.string(),
  updatedAt: z.string(),
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
const ToolSessionEntrySchema = z
  .object({
    id: z.string(),
    tool: z.string(),
  })
  .passthrough();

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
