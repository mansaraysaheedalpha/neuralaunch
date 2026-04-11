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
] as const;
export type DiagnosticVerdict = typeof DIAGNOSTIC_VERDICTS[number];

/**
 * One structured turn from the diagnostic agent. The orchestrating
 * route persists this into Roadmap.diagnosticHistory alongside the
 * founder turn that prompted it.
 */
export const DiagnosticTurnSchema = z.object({
  message: z.string().max(2000).describe(
    'The text the founder will read. Specific, never generic. Reference what the founder said and what their belief state shows. Hard cap of 2000 characters.'
  ),
  verdict: z.enum(DIAGNOSTIC_VERDICTS).describe(
    'still_diagnosing: need more context, ask one focused follow-up. ' +
    'release_to_brief: founder has enough context for the continuation brief — set this when the founder has clearly articulated their reasons for incomplete tasks OR the diagnostic has run for several rounds and the agent has the picture. ' +
    'recommend_re_anchor: founder has lost motivation rather than failed at execution — the message references the motivation anchor and offers them a way back. ' +
    'recommend_breakdown: founder needs task-level help — the message includes the sub-steps inline. ' +
    'recommend_pivot: founder\'s situation has structurally shifted — the message tells them to push back on the recommendation directly.'
  ),
  followUpQuestion: z.string().max(400).optional().describe(
    'Required when verdict is still_diagnosing. One focused question to gather the missing context. NEVER more than one question. Skip this field for any other verdict.'
  ),
});
export type DiagnosticTurn = z.infer<typeof DiagnosticTurnSchema>;

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
