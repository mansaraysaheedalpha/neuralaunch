// src/lib/continuation/diagnostic-schema.ts
//
// Diagnostic chat schemas. The diagnostic agent runs Scenarios A
// (zero tasks completed) and B (partial completion below the brief
// threshold) of the "What's Next?" checkpoint flow. It is a one-turn
// structured-output Sonnet call — each turn produces a verdict and
// optionally a follow-up question.

import { z } from 'zod';

/**
 * Verdict the diagnostic agent emits on every turn. Drives what the
 * orchestrating route does next:
 *
 *   still_diagnosing       — keep the chat open, render the follow-up
 *                            question, wait for the founder's reply
 *   release_to_brief       — founder is ready; fire the brief Inngest
 *                            event and flip continuationStatus
 *   recommend_re_anchor    — founder lost motivation; the agent's
 *                            message references the motivation anchor
 *                            and stays open for one more turn so the
 *                            founder can respond
 *   recommend_breakdown    — the founder needed task-level help; the
 *                            agent's message includes sub-steps; the
 *                            chat closes (the founder goes back to
 *                            executing)
 *   recommend_pivot        — founder's situation has structurally
 *                            shifted; the message routes them to the
 *                            recommendation pushback flow
 */
export const DIAGNOSTIC_VERDICTS = [
  'still_diagnosing',
  'release_to_brief',
  'recommend_re_anchor',
  'recommend_breakdown',
  'recommend_pivot',
  // A1: emitted by the route (not the agent) when the turn limit is
  // reached without a terminal verdict. The route runs one final
  // agent call with a synthesis prompt and wraps the result in an
  // inconclusive turn. The client renders the synthesis plus three
  // resolution options for the founder to pick from.
  'inconclusive',
] as const;
export type DiagnosticVerdict = typeof DIAGNOSTIC_VERDICTS[number];

/**
 * One structured turn from the diagnostic agent. The orchestrating
 * route persists this into Roadmap.diagnosticHistory alongside the
 * founder turn that prompted it.
 */
// CLAUDE.md mandate: .max() on string fields in LLM output schemas
// causes AI_NoObjectGeneratedError when the model exceeds the cap.
// Use .transform() post-clamp instead.
function clampString(max: number) {
  return (raw: string): string => raw.length <= max ? raw : raw.slice(0, max - 1) + '\u2026';
}

export const DiagnosticTurnSchema = z.object({
  message: z.string().transform(clampString(2000)).describe(
    'The text the founder will read. Specific, never generic. Reference what the founder said and what their belief state shows. Hard cap of 2000 characters.'
  ),
  verdict: z.enum(DIAGNOSTIC_VERDICTS).describe(
    'still_diagnosing: need more context, ask one focused follow-up. ' +
    'release_to_brief: founder has enough context for the continuation brief — set this when the founder has clearly articulated their reasons for incomplete tasks OR the diagnostic has run for several rounds and the agent has the picture. ' +
    'recommend_re_anchor: founder has lost motivation rather than failed at execution — the message references the motivation anchor and offers them a way back. ' +
    'recommend_breakdown: founder needs task-level help — the message includes the sub-steps inline. ' +
    'recommend_pivot: founder\'s situation has structurally shifted — the message tells them to push back on the recommendation directly.'
  ),
  followUpQuestion: z.string().transform(clampString(400)).optional().describe(
    'Required when verdict is still_diagnosing. One focused question to gather the missing context. NEVER more than one question. Skip this field for any other verdict.'
  ),
});
export type DiagnosticTurn = z.infer<typeof DiagnosticTurnSchema>;

/**
 * A1: the resolution options presented to the founder when the
 * diagnostic hits the turn cap without a terminal verdict. Each
 * option maps to a verdict that the route processes through
 * nextStatusForVerdict. The labels and descriptions drive the
 * button text rendered by WhatsNextPanel.
 */
export const INCONCLUSIVE_RESOLUTION_OPTIONS = [
  {
    label:   "That's right, and I want help breaking through it.",
    verdict: 'recommend_breakdown' as const,
  },
  {
    label:   'Actually, I think the roadmap itself is the problem.',
    verdict: 'recommend_pivot' as const,
  },
  {
    label:   'I need to step away and think about this.',
    verdict: null, // closes gracefully, no brief generated
  },
] as const;

/**
 * One row in the persisted diagnostic history. Append-only into the
 * Roadmap.diagnosticHistory JSONB column. Founder rows have role
 * 'founder' and only `message`; agent rows have role 'agent' plus
 * the verdict + optional follow-up.
 */
export const DiagnosticHistoryEntrySchema = z.object({
  id:               z.string(),
  timestamp:        z.string(),
  role:             z.enum(['founder', 'agent']),
  message:          z.string(),
  verdict:          z.enum(DIAGNOSTIC_VERDICTS).optional(),
  followUpQuestion: z.string().optional(),
  /**
   * A1: populated only on inconclusive verdict entries. The agent's
   * best interpretation of the core blocker, produced by a dedicated
   * final-turn synthesis call when the diagnostic hits the turn cap.
   * The client renders this as a summary with three resolution options.
   */
  synthesisAttempt: z.string().optional(),
});
export type DiagnosticHistoryEntry = z.infer<typeof DiagnosticHistoryEntrySchema>;

export const DiagnosticHistoryArraySchema = z.array(DiagnosticHistoryEntrySchema);
export type DiagnosticHistory = z.infer<typeof DiagnosticHistoryArraySchema>;

/**
 * Safely parse a Roadmap.diagnosticHistory JSONB value into a
 * DiagnosticHistory. Returns an empty array on parse failure so the
 * caller can proceed without a runtime crash.
 */
export function safeParseDiagnosticHistory(value: unknown): DiagnosticHistory {
  const parsed = DiagnosticHistoryArraySchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}
