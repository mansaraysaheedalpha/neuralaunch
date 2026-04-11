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
import { CHECKIN_AGENT_ACTIONS } from './checkin-types';

const TaskAdjustmentSchema = z.object({
  taskTitle:               z.string().describe('The exact title of an existing downstream task being adjusted.'),
  proposedTitle:           z.string().optional(),
  proposedDescription:     z.string().optional(),
  proposedSuccessCriteria: z.string().optional(),
  rationale:               z.string().describe('One sentence: why this adjustment, grounded in the founder\'s check-in.'),
});

/**
 * Parking-lot capture vector. The check-in agent attaches one of these
 * to its response when the founder's free text reveals an adjacent
 * opportunity, idea, or follow-on direction that does NOT belong on
 * the active roadmap. The route appends the captured item to the
 * parent Roadmap.parkingLot column so it surfaces in the continuation
 * brief at "What's Next?" time.
 */
const ParkingLotCaptureSchema = z.object({
  idea: z.string().min(1).describe(
    'A short phrase capturing the adjacent idea verbatim from the founder. Maximum 280 characters. Must be the founder\'s own idea, not yours.'
  ),
});

/**
 * Tool recommendation surfaced inline in the check-in response.
 * Internal tools live inside NeuraLaunch (validation page, pushback,
 * parking lot). External tools are regular SaaS products the founder
 * would adopt themselves. The `isInternal` flag drives the UI
 * affordance.
 */
const RecommendedToolSchema = z.object({
  name:       z.string().describe('The tool name as the founder would search for it.'),
  purpose:    z.string().describe('One short phrase: why THIS tool for THIS task. Specific to the founder\'s context.'),
  isInternal: z.boolean().describe('true when the tool is a NeuraLaunch surface (validation page, pushback, parking lot). false for any external SaaS or service.'),
});

/**
 * Proactive mid-roadmap recalibration offer. The agent fires this
 * when accumulated check-in evidence suggests the roadmap is
 * structurally off-direction. Distinct from `flagged_fundamental`,
 * which is the hard escape hatch fired on a single blocking signal.
 */
const RecalibrationOfferSchema = z.object({
  reason:  z.string().describe('One sentence: what about the founder\'s execution evidence suggests the roadmap may be off-direction. Reference specifics — task titles, recurring patterns, founder quotes.'),
  framing: z.string().describe('One short paragraph: how to frame the recalibration to the founder. Honest about uncertainty, never alarming, always specific.'),
});

export const CheckInResponseSchema = z.object({
  action: z.enum(CHECKIN_AGENT_ACTIONS).describe(
    'acknowledged: normal friction or successful completion — no roadmap change. ' +
    'adjusted_next_step: blocker reveals a task-level mistake; propose adjustments to the next 1-2 tasks. ' +
    'adjusted_roadmap: reserved for the future structured-edit mechanism — DO NOT use today. ' +
    'flagged_fundamental: blocker reveals the recommendation path itself is wrong; the orchestrator surfaces a re-examine prompt.'
  ),
  message: z.string().max(2000).describe(
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
    'OPTIONAL — fire ONLY when accumulated check-in evidence suggests the roadmap is structurally off-direction (multiple blocked tasks across the roadmap, repeated negative sentiment, a recurring blocker pattern, or evidence one of the recommendation\'s assumptions was wrong). This is the SOFT recalibration signal, distinct from flagged_fundamental. Use sparingly — only when the evidence is genuinely there. NEVER fire on a single check-in unless the single check-in itself is unambiguous evidence the direction is wrong.'
  ),
});
export type CheckInResponse    = z.infer<typeof CheckInResponseSchema>;
export type RecommendedTool    = z.infer<typeof RecommendedToolSchema>;
export type RecalibrationOffer = z.infer<typeof RecalibrationOfferSchema>;
