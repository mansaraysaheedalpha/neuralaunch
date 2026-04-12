// src/lib/roadmap/checkin-types.ts
import { z } from 'zod';
import { RoadmapTaskSchema, RoadmapPhaseSchema } from './roadmap-schema';

/**
 * Check-in extensions to the roadmap task JSON.
 *
 * The roadmap GENERATOR (Phase 2 Opus call) does NOT populate any of
 * these fields. They are added on-demand by the check-in API the
 * first time a founder interacts with a task. Old roadmaps and rows
 * written before this commit will have tasks with these fields
 * absent — readers must default appropriately.
 *
 * NEVER mutate the roadmap JSON in a way that drops these fields.
 * Always merge in place.
 *
 * Two task-level timestamps are written by the status PATCH route:
 *   - startedAt   set on the transition into 'in_progress' (and
 *                 preserved on subsequent in_progress re-entries via
 *                 the same `?? existingValue` guard pattern as
 *                 completedAt). Powers the per-task stale-nudge
 *                 calculation in roadmapNudgeFunction and the
 *                 per-task duration arithmetic in the continuation
 *                 speed-calibration helper.
 *   - completedAt set on the transition into 'completed', preserved
 *                 thereafter.
 *
 * Old tasks predating either field default to null on read; every
 * downstream consumer must handle the null gracefully.
 */

export const TASK_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const CHECKIN_CATEGORIES = ['completed', 'blocked', 'unexpected', 'question'] as const;
export type CheckInCategory = typeof CHECKIN_CATEGORIES[number];

/**
 * Provenance of a check-in entry's free-text content. A12 added the
 * two-option completion flow: when a task transitions to completed
 * the founder either writes their own outcome ('founder') or accepts
 * the success criteria as the outcome by clicking "It went as
 * planned" ('success_criteria_confirmed'). Optional on the schema so
 * legacy entries (every check-in written before A12) parse cleanly;
 * the brief generator and any analytics treat absent as 'founder'.
 */
export const CHECKIN_ENTRY_SOURCES = ['founder', 'success_criteria_confirmed'] as const;
export type CheckInEntrySource = typeof CHECKIN_ENTRY_SOURCES[number];

/**
 * Action label set by the check-in agent on its structured response.
 * Stored on every CheckInEntry as audit + future training signal.
 */
export const CHECKIN_AGENT_ACTIONS = [
  'acknowledged',
  'adjusted_next_step',
  'adjusted_roadmap',
  'flagged_fundamental',
] as const;
export type CheckInAgentAction = typeof CHECKIN_AGENT_ACTIONS[number];

/**
 * Mid-roadmap execution support — canonical persisted shapes for the
 * three optional sub-fields the check-in agent emits and the route
 * persists onto each CheckInEntry. Defined here (not in
 * checkin-agent-schema.ts) because:
 *   1. The persisted shape is the contract — the agent schema in
 *      checkin-agent-schema.ts now imports these so the field names
 *      and types cannot drift between what the agent emits and what
 *      the entry stores.
 *   2. Client components (history list, task card) need to render
 *      these and cannot import from checkin-agent-schema.ts because
 *      it pulls server-only siblings indirectly via CHECKIN_AGENT_ACTIONS.
 *
 * The .describe() metadata stays with the canonical definition so
 * the agent schema gets the LLM-facing prompt text by import, not
 * by redefinition. Adding .describe() is metadata only and does not
 * affect runtime parsing.
 */
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

/**
 * One round of the per-task check-in conversation. Append-only into
 * the task's checkInHistory array. Round numbers are 1-indexed and
 * count user turns; the cap is 5 per task.
 */
export const CheckInEntrySchema = z.object({
  id:           z.string(),
  timestamp:    z.string(),
  category:     z.enum(CHECKIN_CATEGORIES),
  freeText:     z.string(),
  agentResponse: z.string(),
  agentAction:  z.enum(CHECKIN_AGENT_ACTIONS),
  round:        z.number().int().min(1),
  /**
   * For 'adjusted_next_step' actions, the agent's proposed structured
   * adjustment to one or more downstream tasks. Stored as opaque
   * payload — surfaced to the founder as readable text. The accept/
   * reject mechanism that mutates the roadmap is intentionally
   * deferred until real check-in data exists. See the spec.
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
   * A12: provenance of the freeText content. Set to 'founder' when
   * the founder typed their own outcome and to 'success_criteria_confirmed'
   * when the founder clicked "It went as planned" — in which case
   * freeText holds the task's successCriteria text rather than a
   * founder reflection. Optional so legacy entries parse cleanly;
   * absent means 'founder' by default.
   */
  source: z.enum(CHECKIN_ENTRY_SOURCES).optional(),
});
export type CheckInEntry = z.infer<typeof CheckInEntrySchema>;

/**
 * Stored task shape — generator output PLUS the check-in extensions.
 * Every field on the base RoadmapTaskSchema is preserved, four new
 * fields are optional and default to sensible empty values.
 */
export const StoredRoadmapTaskSchema = RoadmapTaskSchema.extend({
  status:         z.enum(TASK_STATUSES).optional(),
  startedAt:      z.string().nullable().optional(),
  completedAt:    z.string().nullable().optional(),
  checkInHistory: z.array(CheckInEntrySchema).optional(),
});
export type StoredRoadmapTask = z.infer<typeof StoredRoadmapTaskSchema>;

export const StoredRoadmapPhaseSchema = RoadmapPhaseSchema.extend({
  tasks: z.array(StoredRoadmapTaskSchema),
});
export type StoredRoadmapPhase = z.infer<typeof StoredRoadmapPhaseSchema>;

export const StoredPhasesArraySchema = z.array(StoredRoadmapPhaseSchema);

/**
 * Hard cap on per-task check-in rounds. Mirrors the pushback round
 * cap on recommendations but at the task level rather than the
 * recommendation level.
 */
export const CHECKIN_HARD_CAP_ROUND = 5;

/**
 * Stable task identifier. The roadmap JSON does not store IDs on
 * tasks; we derive a stable id from (phase, taskIndex) so the API
 * routes can target a single task without storing extra data. Format:
 *   "p<phase>-t<index>" e.g. "p1-t0", "p2-t3"
 */
export function buildTaskId(phase: number, taskIndex: number): string {
  return `p${phase}-t${taskIndex}`;
}

export function parseTaskId(taskId: string): { phase: number; taskIndex: number } | null {
  const m = taskId.match(/^p(\d+)-t(\d+)$/);
  if (!m) return null;
  return { phase: Number(m[1]), taskIndex: Number(m[2]) };
}

/**
 * Read a task from a roadmap phases array, defaulting the check-in
 * fields to their empty shape so callers never have to deal with
 * undefined. Returns null if the task does not exist.
 */
export function readTask(
  phases:    StoredRoadmapPhase[],
  taskId:    string,
): { task: StoredRoadmapTask; phaseIndex: number; taskIndex: number } | null {
  const parsed = parseTaskId(taskId);
  if (!parsed) return null;
  const phaseIdx = phases.findIndex(p => p.phase === parsed.phase);
  if (phaseIdx === -1) return null;
  const phase = phases[phaseIdx];
  const task = phase.tasks[parsed.taskIndex];
  if (!task) return null;
  return {
    task: {
      ...task,
      status:         task.status         ?? 'not_started',
      startedAt:      task.startedAt      ?? null,
      completedAt:    task.completedAt    ?? null,
      checkInHistory: task.checkInHistory ?? [],
    },
    phaseIndex: phaseIdx,
    taskIndex:  parsed.taskIndex,
  };
}

/**
 * Apply a partial update to a single task and return a new phases
 * array. Pure — does not mutate the input.
 */
export function patchTask(
  phases:  StoredRoadmapPhase[],
  taskId:  string,
  updater: (task: StoredRoadmapTask) => StoredRoadmapTask,
): StoredRoadmapPhase[] | null {
  const found = readTask(phases, taskId);
  if (!found) return null;
  const next = phases.map((phase, pi) => {
    if (pi !== found.phaseIndex) return phase;
    return {
      ...phase,
      tasks: phase.tasks.map((task, ti) => {
        if (ti !== found.taskIndex) return task;
        return updater({
          ...task,
          status:         task.status         ?? 'not_started',
          startedAt:      task.startedAt      ?? null,
          completedAt:    task.completedAt    ?? null,
          checkInHistory: task.checkInHistory ?? [],
        });
      }),
    };
  });
  return next;
}

/**
 * Compute summary counts from a phases array. Used to refresh the
 * RoadmapProgress row whenever the JSON changes.
 */
export function computeProgressSummary(phases: StoredRoadmapPhase[]): {
  totalTasks:     number;
  completedTasks: number;
  blockedTasks:   number;
} {
  let total = 0;
  let completed = 0;
  let blocked = 0;
  for (const phase of phases) {
    for (const task of phase.tasks) {
      total++;
      if (task.status === 'completed') completed++;
      if (task.status === 'blocked')   blocked++;
    }
  }
  return { totalTasks: total, completedTasks: completed, blockedTasks: blocked };
}
