import { z } from 'zod';
import {
  TASK_STATUSES,
  CHECKIN_CATEGORIES,
  CHECKIN_AGENT_ACTIONS,
  CHECKIN_ENTRY_SOURCES,
} from '@neuralaunch/constants';
import { RoadmapTaskSchema, RoadmapPhaseSchema } from './roadmap';

/**
 * Check-in shapes — the persisted task-level conversation history
 * and the storage extensions that decorate roadmap tasks with status,
 * timestamps, and tool sessions.
 *
 * Mobile imports these to render task cards and check-in history
 * with runtime validation, ensuring the same shape contract the
 * client server-side enforces.
 */

// ---------------------------------------------------------------------------
// Sub-shapes used inside CheckInEntry
// ---------------------------------------------------------------------------

export const TaskAdjustmentEntrySchema = z.object({
  taskTitle:               z.string().describe('The exact title of an existing downstream task being adjusted.'),
  proposedTitle:           z.string().optional(),
  proposedDescription:     z.string().optional(),
  proposedSuccessCriteria: z.string().optional(),
  rationale:               z.string().describe('One sentence: why this adjustment, grounded in the founder\'s check-in.'),
});
export type TaskAdjustmentEntry = z.infer<typeof TaskAdjustmentEntrySchema>;

export const RecommendedToolEntrySchema = z.object({
  name:       z.string().describe('The tool name as the founder would search for it.'),
  purpose:    z.string().describe('One short phrase: why THIS tool for THIS task. Specific to the founder\'s context.'),
  isInternal: z.boolean().describe('true when the tool is a NeuraLaunch surface (validation page, pushback, parking lot). false for any external SaaS or service.'),
});
export type RecommendedToolEntry = z.infer<typeof RecommendedToolEntrySchema>;

export const RecalibrationOfferEntrySchema = z.object({
  reason:  z.string().describe('One sentence: what about the founder\'s execution evidence suggests the roadmap may be off-direction. Reference specifics — task titles, recurring patterns, founder quotes.'),
  framing: z.string().describe('One short paragraph: how to frame the recalibration to the founder. Honest about uncertainty, never alarming, always specific.'),
});
export type RecalibrationOfferEntry = z.infer<typeof RecalibrationOfferEntrySchema>;

// ---------------------------------------------------------------------------
// Per-round check-in entry shape — append-only into task.checkInHistory
// ---------------------------------------------------------------------------

/**
 * One round of the per-task check-in conversation. Append-only into
 * the task's checkInHistory array. Round numbers are 1-indexed and
 * count user turns; the cap is CHECKIN_HARD_CAP_ROUND per task.
 */
export const CheckInEntrySchema = z.object({
  id:           z.string(),
  timestamp:    z.string(),
  category:     z.enum(CHECKIN_CATEGORIES),
  freeText:     z.string(),
  agentResponse: z.string(),
  agentAction:  z.enum(CHECKIN_AGENT_ACTIONS),
  // min(0) rather than min(1): task-diagnostic entries use round=0
  // to signal "this is a diagnostic turn, not a check-in round."
  // Scheduled check-in rounds are 1-indexed and capped at
  // CHECKIN_HARD_CAP_ROUND. Diagnostic entries are distinguished by
  // source='task_diagnostic' + round=0.
  round:        z.number().int().min(0),
  /**
   * For 'adjusted_next_step' actions, the agent's proposed structured
   * adjustment to one or more downstream tasks. Stored as opaque
   * payload — surfaced to the founder as readable text. The accept/
   * reject mechanism that mutates the roadmap is intentionally
   * deferred until real check-in data exists.
   */
  proposedChanges: z.array(TaskAdjustmentEntrySchema).optional(),
  /**
   * Mid-roadmap execution support — sub-step breakdown the agent
   * surfaced because the founder seemed unclear how to start. 3-6
   * imperative phrases. Persisted so the founder can re-read them
   * later from the task transcript.
   */
  subSteps: z.array(z.string()).optional(),
  /**
   * Mid-roadmap execution support — tool recommendations the agent
   * surfaced when the founder asked what to use. Each entry has a
   * name, a one-phrase purpose, and an isInternal flag that drives
   * whether the UI renders the chip as a NeuraLaunch deep link.
   */
  recommendedTools: z.array(RecommendedToolEntrySchema).optional(),
  /**
   * Mid-roadmap execution support — soft recalibration offer fired
   * when accumulated check-in evidence suggests the roadmap is
   * structurally off-direction. The UI renders this as a "pause and
   * reconsider" affordance that links into the recommendation
   * pushback flow today and the continuation checkpoint in Phase 5.
   */
  recalibrationOffer: RecalibrationOfferEntrySchema.optional(),
  /**
   * Provenance of the freeText content. Set to 'founder' when the
   * founder typed their own outcome and to 'success_criteria_confirmed'
   * when the founder clicked "It went as planned" — in which case
   * freeText holds the task's successCriteria text rather than a
   * founder reflection. 'task_diagnostic' marks rows written by the
   * task-level diagnostic flow. Optional so legacy entries parse
   * cleanly; absent means 'founder' by default.
   */
  source: z.enum(CHECKIN_ENTRY_SOURCES).optional(),
});
export type CheckInEntry = z.infer<typeof CheckInEntrySchema>;

// ---------------------------------------------------------------------------
// Stored task / phase shapes — generator output PLUS the check-in extensions
// ---------------------------------------------------------------------------

/**
 * Stored task shape — generator output PLUS the check-in extensions.
 * Every field on the base RoadmapTaskSchema is preserved; the new
 * fields are optional and default to sensible empty values on read.
 *
 * Tool-session fields (coachSession, composerSession, researchSession,
 * packagerSession) are intentionally NOT on the shared shape. They
 * are client-side-only concerns — added by the client's per-tool
 * extensions in client/src/lib/roadmap/checkin-types.ts where the
 * strict per-tool validators live alongside them. Including them here
 * with .passthrough() or z.unknown() collapses the inferred type to
 * `{ [x: string]: unknown }` when Inngest's JsonifyObject wrapper
 * sees the StoredRoadmapTask, breaking assignability at every Inngest
 * step that reads StoredRoadmapPhase[] from a step return value.
 */
export const StoredRoadmapTaskSchema = RoadmapTaskSchema.extend({
  status:         z.enum(TASK_STATUSES).optional(),
  startedAt:      z.string().nullable().optional(),
  completedAt:    z.string().nullable().optional(),
  checkInHistory: z.array(CheckInEntrySchema).optional(),
  /**
   * One-sentence narrative arc of the per-task check-in conversation,
   * generated by a single Haiku summarisation call after the task
   * hits its terminal moment (round cap OR completed-with-2+-entries).
   * Captures how the founder's understanding evolved across rounds.
   *
   * Nullable + optional: tasks with 0 or 1 check-ins skip the
   * summarisation call (no arc to summarise) and the field stays
   * absent. If Haiku is unavailable at trigger time the field stays
   * null and the brief generator falls back to the latest-message-
   * only rendering. The brief still generates, just with less
   * narrative context on that task.
   */
  conversationArc: z.string().nullable().optional(),
});

/**
 * Prettify forces TypeScript to expand a complex generic type into
 * its plain object shape. Without it, z.infer on schemas defined in
 * a workspace package produces deferred types that downstream
 * consumers (notably Inngest's JsonifyObject wrapper) cannot
 * structurally collapse — and assignability breaks at the boundary.
 * Wrapping the inferred type in Prettify resolves it eagerly so
 * both sides see the same expanded shape.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type StoredRoadmapTask = Prettify<z.infer<typeof StoredRoadmapTaskSchema>>;

export const StoredRoadmapPhaseSchema = RoadmapPhaseSchema.extend({
  tasks: z.array(StoredRoadmapTaskSchema),
});
export type StoredRoadmapPhase = Prettify<z.infer<typeof StoredRoadmapPhaseSchema>>;

export const StoredPhasesArraySchema = z.array(StoredRoadmapPhaseSchema);
