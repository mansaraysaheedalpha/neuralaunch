// src/lib/roadmap/checkin-agent-schema.ts
//
// Structured-output schemas for the check-in agent. Split out from
// checkin-agent.ts so the schema declarations live separately from
// the runtime function — schemas are declarations (CLAUDE.md gives
// them a 150-line cap), the agent runtime is logic (350-line cap).
//
// All five optional output channels live here:
//   - proposedChanges     (existing — adjusted_next_step proposals)
//   - parkingLotItem      (continuation phase 1 — adjacent idea capture)
//   - subSteps            (continuation phase 2 — task breakdown)
//   - recommendedTools    (continuation phase 2 — tool recommendations)
//   - recalibrationOffer  (continuation phase 2 — soft re-direction)

import { z } from 'zod';
import {
  CHECKIN_AGENT_ACTIONS,
  TaskAdjustmentEntrySchema,
  RecommendedToolEntrySchema,
  RecalibrationOfferEntrySchema,
} from './checkin-types';

// CLAUDE.md mandate: "Zod schemas for LLM output must NOT use .max()
// on string fields." Anthropic's structured-output endpoint does not
// consistently enforce string-length constraints during generation —
// the model produces a longer string and the AI SDK's post-hoc Zod
// parse rejects the entire response as AI_NoObjectGeneratedError.
// Length intent goes in .describe() copy, and bounds are enforced via
// post-clamp .transform() so the recommendation is never lost to a
// spurious length validation failure. The clamp is conservative — it
// preserves the head of the string and adds an ellipsis so callers
// can tell truncation happened without parsing the value.
const MAX_AGENT_MESSAGE_CHARS  = 2000;
const MAX_PARKING_LOT_IDEA_CHARS = 280;

function clampString(max: number) {
  return (raw: string): string => raw.length <= max ? raw : raw.slice(0, max - 1) + '\u2026';
}

// The agent-side aliases below exist purely for naming clarity in
// the CheckInResponseSchema field declarations — they refer to the
// SAME canonical sub-schemas exported from checkin-types.ts. Importing
// these here means a change to the persisted shape automatically
// flows into the agent's structured-output contract; the two schemas
// cannot drift apart.
const TaskAdjustmentSchema   = TaskAdjustmentEntrySchema;
const RecommendedToolSchema  = RecommendedToolEntrySchema;
const RecalibrationOfferSchema = RecalibrationOfferEntrySchema;

/**
 * Parking-lot capture vector. The check-in agent attaches one of these
 * to its response when the founder's free text reveals an adjacent
 * opportunity, idea, or follow-on direction that does NOT belong on
 * the active roadmap. The route appends the captured item to the
 * parent Roadmap.parkingLot column so it surfaces in the continuation
 * brief at "What's Next?" time.
 *
 * Lives only in this file (not in checkin-types.ts) because parking
 * lot items are persisted to Roadmap.parkingLot, NOT to a CheckInEntry.
 * The persisted shape lives in lib/continuation/parking-lot-schema.ts.
 */
const ParkingLotCaptureSchema = z.object({
  idea: z.string().min(1).transform(clampString(MAX_PARKING_LOT_IDEA_CHARS)).describe(
    'A short phrase capturing the adjacent idea verbatim from the founder. Maximum 280 characters. Must be the founder\'s own idea, not yours.'
  ),
});

export const CheckInResponseSchema = z.object({
  action: z.enum(CHECKIN_AGENT_ACTIONS).describe(
    'acknowledged: normal friction or successful completion — no roadmap change. ' +
    'adjusted_next_step: blocker reveals a task-level mistake; propose adjustments to the next 1-2 tasks. ' +
    'adjusted_roadmap: reserved for the future structured-edit mechanism — DO NOT use today.'
  ),
  message: z.string().transform(clampString(MAX_AGENT_MESSAGE_CHARS)).describe(
    'The text the founder will read. Specific to their task, their context, and their belief state. ' +
    'Never generic encouragement. Hard cap of 2000 characters.'
  ),
  proposedChanges: z.array(TaskAdjustmentSchema).optional().describe(
    'Required when action is adjusted_next_step. Each entry references a downstream task by its title and proposes specific edits.'
  ),
  parkingLotItem: ParkingLotCaptureSchema.optional().describe(
    'OPTIONAL — only set when the founder\'s free text mentions an adjacent idea, opportunity, or follow-on direction that does not belong on the active roadmap. Captured verbatim and surfaced in the continuation brief later. Be conservative: do not emit on every check-in. Do not invent adjacent ideas — only echo what the founder actually said.'
  ),
  subSteps: z.array(z.string()).optional().describe(
    'OPTIONAL — when the founder seems unclear how to actually start or execute the task (e.g. "I don\'t know where to begin", "this feels overwhelming", asks how to do it), break the task into 3-6 concrete sub-steps. Each sub-step is one imperative phrase: an action they could take in 30-60 minutes. Use only when there is genuine HOW confusion, never as a default.'
  ),
  recommendedTools: z.array(RecommendedToolSchema).optional().describe(
    'OPTIONAL — when the founder asks what to use or appears unsure how to execute (and tooling is the gap), recommend 1-4 specific tools. ALWAYS honour the founder\'s budget — do not recommend paid tools if runway is tight. Internal NeuraLaunch tools (validation page, pushback engine, parking lot) count and should be surfaced first when relevant. Skip this field entirely when the founder did not ask about tooling and the agent has no specific recommendation.'
  ),
  recalibrationOffer: RecalibrationOfferSchema.optional().describe(
    'OPTIONAL — fire ONLY when accumulated check-in evidence suggests the roadmap is structurally off-direction (multiple blocked tasks across the roadmap, repeated negative sentiment, a recurring blocker pattern, or evidence one of the recommendation\'s assumptions was wrong). Use sparingly — only when the evidence is genuinely there. The system gates this with a 40% check-in coverage minimum, so focus on whether the evidence warrants it, not on whether it is too early.'
  ),
});
export type CheckInResponse    = z.infer<typeof CheckInResponseSchema>;
export type RecommendedTool    = z.infer<typeof RecommendedToolSchema>;
export type RecalibrationOffer = z.infer<typeof RecalibrationOfferSchema>;
