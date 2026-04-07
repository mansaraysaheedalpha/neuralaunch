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
 */

export const TASK_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const CHECKIN_CATEGORIES = ['completed', 'blocked', 'unexpected', 'question'] as const;
export type CheckInCategory = typeof CHECKIN_CATEGORIES[number];

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
  proposedChanges: z.array(z.object({
    taskTitle:        z.string(),
    proposedTitle:    z.string().optional(),
    proposedDescription: z.string().optional(),
    proposedSuccessCriteria: z.string().optional(),
    rationale:        z.string(),
  })).optional(),
});
export type CheckInEntry = z.infer<typeof CheckInEntrySchema>;

/**
 * Stored task shape — generator output PLUS the check-in extensions.
 * Every field on the base RoadmapTaskSchema is preserved, three new
 * fields are optional and default to sensible empty values.
 */
export const StoredRoadmapTaskSchema = RoadmapTaskSchema.extend({
  status:         z.enum(TASK_STATUSES).optional(),
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
