// src/lib/continuation/brief-schema.ts
//
// The five-section continuation brief — the canonical structured
// output of the brief generator (Opus). See section "The Continuation
// Brief" in docs/ROADMAP_CONTINUATION.md.
//
// V2 (this file): §II is an array of overturned-assumption objects
// linked verbatim to the source recommendation's assumptions, §III is
// a signal ledger of metric/reading/signal rows, and removedForks
// surfaces directions the evidence killed. V1 briefs (prose §II/§III,
// no removedForks) persisted before this PR keep parsing through the
// legacy read-time fallback so no rows are lost.

import { z } from 'zod';

/**
 * One fork in the continuation brief. The founder picks one and the
 * cycle generates the next-cycle roadmap from it. Forks are NOT a
 * passive menu — each one is a real decision with concrete first
 * action and an honest "right if" condition.
 */
export const ContinuationForkSchema = z.object({
  id: z.string().describe(
    'Stable id for the fork — "fork-1", "fork-2", "fork-3". Used by the founder pick API as the fork selector.'
  ),
  title: z.string().describe(
    'Short imperative phrase capturing the direction. Verb-first. Example: "Double down on catering customers" or "Build the founder community first".'
  ),
  rationale: z.string().describe(
    'Two sentences: why this fork is on the menu given what the founder learned from execution. Reference specific evidence — task titles, parking-lot items, blocker patterns.'
  ),
  firstStep: z.string().describe(
    'One concrete first task the founder could start tomorrow. Achievable in their actual hours per week, not their stated hours. Specific enough to be done in 2-4 hours.'
  ),
  timeEstimate: z.string().describe(
    'Realistic timeline for the first meaningful result on this fork, calibrated to the founder\'s ACTUAL execution speed (not their original stated hours). Reference the calibration explicitly when the actual pace differed from the stated pace.'
  ),
  rightIfCondition: z.string().describe(
    'One sentence: "This fork is right if [condition specific to the founder\'s actual situation]." Never generic — must reference something the founder learned by executing.'
  ),
  // Optional Stage-5-reserve origin. Set ONLY when the fork was seeded
  // from a reserve opportunity in the RESERVE OPPORTUNITIES block. The
  // value MUST match a `ReserveOpportunity.id` from that block. Null
  // (and absent) for forks that continue the current direction or come
  // from the parking lot — i.e. for every fork on legacy Discovery-flow
  // briefs where the block is absent entirely.
  sourceReserveId: z.string().nullable().optional().describe(
    'Set to the Stage 5 reserve opportunity id when this fork pivots to a reserve. Null/absent for continuation forks and forks derived from the parking lot. Powers the post-pick analytics and lets the UI render a "pivot to reserve" badge.'
  ),
  /**
   * Shape of the fork relative to the cycle that just completed.
   *   - deepen  : keep the same direction, narrow the offer
   *   - widen   : same direction, broader audience or surface
   *   - package : repackage the same delivery into a different format
   *   - pivot   : decisively change direction (often a reserve-seeded fork)
   *   - other   : doesn't fit the above; explain in `rationale`
   * Optional so V1 / legacy briefs continue to parse. Powers the
   * cover-stat KIND glyph on the continuation handoff. Added in PR
   * 16-data.
   */
  kind: z.enum(['deepen', 'widen', 'package', 'pivot', 'other']).optional().describe(
    'Classify the relationship of this fork to the just-completed cycle: deepen (same direction, narrower), widen (same direction, broader), package (same delivery, different format), pivot (decisive change of direction — most reserve-seeded forks land here), other (escape hatch — explain in rationale). Pick exactly one. Omit only when none of the five honestly applies.'
  ),
});
export type ContinuationFork = z.infer<typeof ContinuationForkSchema>;

/**
 * §II row — one overturned (or partially-upheld) assumption from the
 * source recommendation. The `assumption` field echoes the
 * recommendation's `assumptions[i]` verbatim where one cycle finding
 * maps to one assumption, so the brief UI can render the assumption
 * struck-through and link the founder back to what they originally
 * agreed to.
 */
export const OverturnedAssumptionItemSchema = z.object({
  assumption: z.string().describe(
    'The original recommendation assumption — TAKEN VERBATIM from the assumptions list above when one cycle finding maps cleanly to one assumption. Paraphrased only when the finding spans multiple assumptions; in that case keep the language close to the original.'
  ),
  actually: z.string().describe(
    'The counter-finding: 1-2 sentences naming what the execution evidence ACTUALLY showed. Cite the specific signal — numbers, founder quotes, observed behaviour. This is what makes the assumption "wrong" and what shifts the next cycle.'
  ),
  status: z.enum(['overturned', 'partially_upheld']).describe(
    'overturned when the evidence clearly flipped the assumption; partially_upheld when it held in spirit but needs a caveat (channel, sizing, timing) before the next cycle.'
  ),
});
export type OverturnedAssumptionItem = z.infer<typeof OverturnedAssumptionItemSchema>;

/**
 * §III row — one signal in the evidence ledger. metric is a short
 * mono-label; reading is the founder-specific interpretation; signal
 * is the colour-coded classification the UI renders as a serif-italic
 * stamp.
 */
export const EvidenceSignalRowSchema = z.object({
  metric: z.string().describe(
    'Short mono-label name of the metric — 2-4 words (e.g. "Conversion to paid", "Price tolerance", "Audience type", "Time-cost reality"). Avoid sentences.'
  ),
  reading: z.string().describe(
    '1-2 sentences interpreting the metric with founder-specific numbers, observations, or direct quotes. Reference the source (a check-in, a task, a parking-lot item). Concrete > generic.'
  ),
  signal: z.enum(['strong', 're_aim', 'negative', 'weak', 'capped']).describe(
    'strong = the evidence confirms the direction (renders green); re_aim = course-correct, the metric points sideways (amber); negative = the evidence disconfirms a previous assumption (accent); weak = too little data to call (muted); capped = a ceiling has been hit (e.g. throughput) that constrains the next cycle (amber).'
  ),
});
export type EvidenceSignalRow = z.infer<typeof EvidenceSignalRowSchema>;

/**
 * Optional §IV footnote — a direction that WAS on the table at
 * synthesis time but the cycle's evidence has now decisively killed.
 * Surfacing the kill (with the reason) is a signature trust move:
 * "the app fork removed — 0 of 4 wanted one — it can return if Cycle
 * II surfaces a different signal."
 */
export const RemovedForkSchema = z.object({
  title: z.string().describe(
    'Short verb-first label of the removed direction (e.g. "Build the app", "Open a second clinic").'
  ),
  reason: z.string().describe(
    'One sentence stating why the evidence killed this direction. Cite the specific signal that did the killing (numbers, quotes). Honest — do not soften.'
  ),
});
export type RemovedFork = z.infer<typeof RemovedForkSchema>;

/**
 * One parking-lot item as it appears in the brief. Mirrors the
 * runtime ParkingLotItem shape minus the id (the brief renders by
 * value, not by reference). The agent does not need the id to render
 * the item — the founder reads them in order.
 */
export const ParkingLotBriefEntrySchema = z.object({
  idea:         z.string(),
  surfacedAt:   z.string(),
  surfacedFrom: z.string(),
  taskContext:  z.string().nullable(),
});
export type ParkingLotBriefEntry = z.infer<typeof ParkingLotBriefEntrySchema>;

/**
 * The five-section continuation brief (V2). Generated by Opus from
 * the full execution evidence base — roadmap progress, check-in
 * transcripts, parking-lot items, execution metrics, and the original
 * recommendation context. Validated through this schema before write.
 *
 * V2 changes vs the pre-PR-08-data prose schema:
 *   - whatIGotWrong       :  string  → OverturnedAssumptionItem[]
 *   - whatTheEvidenceSays :  string  → EvidenceSignalRow[]
 *   - removedForks        :  (new optional field)
 *
 * Pre-V2 rows in the DB continue to parse via `safeParseContinuationBrief`'s
 * legacy fallback (LegacyContinuationBriefSchema below).
 */
export const ContinuationBriefSchema = z.object({
  whatHappened: z.string().describe(
    'Section 1 — 3 to 4 sentences interpreting what the founder learned by executing the roadmap. NOT a list of completed tasks — an interpretation. Reference specific tasks where relevant. The interpretation quality is the entire value of continuation.'
  ),
  whatIGotWrong: z.array(OverturnedAssumptionItemSchema).describe(
    'Section 2 — 1 to 4 entries, one per assumption from the original recommendation that the execution evidence overturned or partially upheld. Take each `assumption` VERBATIM from the recommendation\'s assumptions list above where the mapping is clean. If every assumption held, return an empty array honestly — do not invent overturns. If multiple were overturned, prioritise the most decision-changing ones.'
  ),
  whatTheEvidenceSays: z.array(EvidenceSignalRowSchema).describe(
    'Section 3 — 3 to 7 signal rows extracted from check-ins, completed tasks, conversation arcs, parking-lot items, and any quoted founder words. Each row is a metric, the reading, and a classification. Cover the highest-evidence-density signals first; do not pad to a fixed count.'
  ),
  forks: z.array(ContinuationForkSchema).describe(
    'Section 4 — 2 to 3 forks. Each one is a real decision the founder can make. Not a menu to pick passively. Distinct directions, each with concrete first move and "right if" condition. The phase count of any next roadmap is implied by the fork shape, not by a default.'
  ),
  removedForks: z.array(RemovedForkSchema).optional().describe(
    'Optional. A direction that was on the table at synthesis time but the cycle\'s evidence has now decisively killed. Surface ONLY when the kill is unambiguous (e.g. "0 of 4 wanted X"). Keep to 0 or 1 entry — this is a signature honesty move, not a place to enumerate every passing thought. Omit or empty when nothing was killed.'
  ),
  parkingLotItems: z.array(ParkingLotBriefEntrySchema).describe(
    'Section 5 — every parking-lot item from the roadmap, surfaced now because this is the moment they may be relevant. May be empty if no items were captured during execution. Do not invent items; pass through the items provided in the input verbatim.'
  ),
  closingThought: z.string().describe(
    '2 to 3 sentences addressed directly to the founder. Acknowledge what they did, frame the choice ahead, and end with "the next decision is yours". Honest, never patronising.'
  ),
});
export type ContinuationBrief = z.infer<typeof ContinuationBriefSchema>;

/**
 * LegacyContinuationBriefSchema — the pre-PR-08-data shape, kept ONLY
 * for read-time back-compat. Rows persisted before V2 land here and
 * the brief UI renders §II / §III as prose via a type guard.
 *
 * Do NOT pass this schema to `Output.object({ schema })` — generation
 * is V2-only from PR 08-data onwards.
 */
const LegacyContinuationBriefSchema = z.object({
  whatHappened:        z.string(),
  whatIGotWrong:       z.string(),
  whatTheEvidenceSays: z.string(),
  forks:               z.array(ContinuationForkSchema),
  parkingLotItems:     z.array(ParkingLotBriefEntrySchema),
  closingThought:      z.string(),
});
export type LegacyContinuationBrief = z.infer<typeof LegacyContinuationBriefSchema>;

/**
 * Discriminated union the GET resolver hands back. Consumers branch
 * via `isLegacyBrief` when they need to render §II / §III.
 */
export type ContinuationBriefAny = ContinuationBrief | LegacyContinuationBrief;

/**
 * Read-time parser — tries the strict V2 schema first; falls back to
 * the V1 prose shape so existing rows still render. Returns null only
 * on truly malformed JSONB (corrupt, neither shape parses).
 */
export function safeParseContinuationBrief(value: unknown): ContinuationBriefAny | null {
  if (value == null) return null;
  const v2 = ContinuationBriefSchema.safeParse(value);
  if (v2.success) return v2.data;
  const v1 = LegacyContinuationBriefSchema.safeParse(value);
  if (v1.success) return v1.data;
  return null;
}

/**
 * Type guard — returns true when the row is the legacy prose-§II/§III
 * shape. Use this in the renderer to fall back to <BriefProse> for
 * the two sections instead of rendering the structured cards/ledger.
 */
export function isLegacyBrief(b: ContinuationBriefAny): b is LegacyContinuationBrief {
  return typeof (b as LegacyContinuationBrief).whatIGotWrong === 'string';
}
