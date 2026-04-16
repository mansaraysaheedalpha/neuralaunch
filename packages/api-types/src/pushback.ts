import { z } from 'zod';
import { PUSHBACK_MODES, PUSHBACK_ACTIONS } from '@neuralaunch/constants';

/**
 * Pushback shapes — the persisted conversation transcript of the
 * up-to-7-round adversarial dialogue between the founder and the
 * recommendation, plus the structured response shape the agent
 * returns on each turn.
 *
 * Mobile imports these to render the pushback chat with runtime
 * validation, ensuring it stays in sync with whatever the client's
 * pushback engine writes to Recommendation.pushbackHistory (JSONB).
 */

// ---------------------------------------------------------------------------
// Transcript turn shapes
// ---------------------------------------------------------------------------

/**
 * One turn in the pushback conversation. Stored as a row in
 * Recommendation.pushbackHistory (a JSONB array). The shape is
 * append-only and self-describing — every turn carries its round
 * number so the history does not have to be parsed positionally.
 */
export interface PushbackTurnUser {
  role:      'user';
  content:   string;
  round:     number;
  timestamp: string;
}

export interface PushbackTurnAgent {
  role:      'agent';
  content:   string;
  round:     number;
  mode:      'analytical' | 'fear' | 'lack_of_belief';
  action:    'continue_dialogue' | 'defend' | 'refine' | 'replace' | 'closing';
  converging: boolean;
  timestamp: string;
}

export type PushbackTurn = PushbackTurnUser | PushbackTurnAgent;

// ---------------------------------------------------------------------------
// Runtime schemas for parsing pushbackHistory on read
// ---------------------------------------------------------------------------

/**
 * JSONB columns have no compile-time guarantees — a hand-edited row,
 * an older code-version write, or a future schema change can corrupt
 * the shape. Every read path that hands the array to the prompt
 * builder or to the client should run it through PushbackHistorySchema
 * and fall back to an empty array on parse failure rather than crashing.
 */
const PushbackTurnUserSchema = z.object({
  role:      z.literal('user'),
  content:   z.string(),
  round:     z.number().int().nonnegative(),
  timestamp: z.string(),
});

const PushbackTurnAgentSchema = z.object({
  role:      z.literal('agent'),
  content:   z.string(),
  round:     z.number().int().nonnegative(),
  mode:      z.enum([PUSHBACK_MODES.ANALYTICAL, PUSHBACK_MODES.FEAR, PUSHBACK_MODES.LACK_OF_BELIEF]),
  action:    z.enum([
    PUSHBACK_ACTIONS.CONTINUE_DIALOGUE,
    PUSHBACK_ACTIONS.DEFEND,
    PUSHBACK_ACTIONS.REFINE,
    PUSHBACK_ACTIONS.REPLACE,
    PUSHBACK_ACTIONS.CLOSING,
  ]),
  converging: z.boolean(),
  timestamp: z.string(),
});

export const PushbackTurnSchema = z.discriminatedUnion('role', [
  PushbackTurnUserSchema,
  PushbackTurnAgentSchema,
]);

export const PushbackHistorySchema = z.array(PushbackTurnSchema);

/**
 * Safely parse a pushbackHistory JSONB value into PushbackTurn[].
 * Returns [] on any failure. Use this everywhere a Recommendation
 * row is loaded — never cast the JSONB column directly.
 */
export function safeParsePushbackHistory(value: unknown): PushbackTurn[] {
  const parsed = PushbackHistorySchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

// ---------------------------------------------------------------------------
// Agent response shape — the structured output of the first pushback call
// ---------------------------------------------------------------------------

/**
 * The structured response shape returned by the Opus pushback turn.
 *
 * NOTE on the action enum: this schema only lists the four model-driven
 * actions. The fifth action label, 'closing', is constructed manually
 * in the route handler on the HARD_CAP_ROUND turn — the model never
 * sees or returns 'closing'. The closing message is templated by
 * buildClosingMessage() and the alternative-synthesis is queued via
 * Inngest.
 *
 * Every field is required so Anthropic's grammar compiler builds a
 * single linear path with no branching. The historic version had a
 * deeply nested optional `patch` field; that combination consistently
 * blew Opus's grammar compilation budget under load. The synthesis
 * engine never had this problem because RecommendationSchema is fully
 * required. The current architecture mirrors that — a separate second
 * call (using RecommendationSchema directly) handles the rewrite when
 * the agent's action is refine or replace.
 */
export const PushbackResponseSchema = z.object({
  mode: z.enum([
    PUSHBACK_MODES.ANALYTICAL,
    PUSHBACK_MODES.FEAR,
    PUSHBACK_MODES.LACK_OF_BELIEF,
  ]).describe("Classify the founder's message before responding."),
  action: z.enum([
    PUSHBACK_ACTIONS.CONTINUE_DIALOGUE,
    PUSHBACK_ACTIONS.DEFEND,
    PUSHBACK_ACTIONS.REFINE,
    PUSHBACK_ACTIONS.REPLACE,
  ]).describe(
    'continue_dialogue when you need more information before committing. ' +
    "defend when the objection is wrong and the founder's own context contradicts it. " +
    'refine when partially correct — same path, adjusted steps/risks/framing. ' +
    'replace when fully correct and the original needs to be rewritten.'
  ),
  converging: z.boolean().describe(
    'true if this exchange is converging toward resolution. false if you sense the ' +
    'conversation is circling — the founder is repeating themselves or new objections ' +
    'are appearing without earlier ones being settled. The server uses this to decide ' +
    'whether to inject a soft re-frame on round 4.'
  ),
  message: z.string().describe(
    "The text the founder will read. This is the agent's response — written in the " +
    "founder's register, grounded in their belief state. Never generic encouragement. " +
    'Aim for 600-1500 characters to keep the chat readable. The server hard-truncates ' +
    'at 6000 characters before persisting; do not rely on that as a budget.'
  ),
});

export type PushbackResponse = z.infer<typeof PushbackResponseSchema>;
