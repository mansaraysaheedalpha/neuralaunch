// src/lib/roadmap/checkin-types.ts
//
// Cross-app constants and most Zod schemas live in the workspace
// packages — re-exported here so existing client imports continue to
// work unchanged. New code should import directly from
// @neuralaunch/constants and @neuralaunch/api-types.
//
// What's defined LOCALLY (not just re-exported):
//   - The client-side StoredRoadmapTaskSchema, which extends the
//     shared base schema with the four tool-session passthrough
//     fields (coachSession, composerSession, researchSession,
//     packagerSession). Those fields are kept off the shared schema
//     in @neuralaunch/api-types because their inferred type
//     ({ [x: string]: unknown }) collapses StoredRoadmapTask down
//     to an opaque shape under Inngest's JsonifyObject wrapper,
//     breaking assignability at every Inngest function that reads
//     a StoredRoadmapPhase[] from a step return value. The strict
//     per-tool validators (CoachSessionSchema, ComposerSessionSchema,
//     etc.) live next to each engine and are applied at the moment
//     the session is read. Mobile gets the lean base schema; client
//     gets the extended one.
//   - The pure helper functions (countTasksWithCheckins, buildTaskId,
//     parseTaskId, readTask, patchTask, computeProgressSummary).
//     Client-side domain logic — mobile reads its roadmap differently.

import { z } from 'zod';
import {
  StoredRoadmapTaskSchema as BaseStoredRoadmapTaskSchema,
  StoredRoadmapPhaseSchema as BaseStoredRoadmapPhaseSchema,
} from '@neuralaunch/api-types';

// Re-export the cross-app constants (canonical source: @neuralaunch/constants).
export {
  TASK_STATUSES,
  type TaskStatus,
  CHECKIN_CATEGORIES,
  type CheckInCategory,
  CHECKIN_ENTRY_SOURCES,
  type CheckInEntrySource,
  CHECKIN_AGENT_ACTIONS,
  type CheckInAgentAction,
  CHECKIN_HARD_CAP_ROUND,
  RECALIBRATION_MIN_COVERAGE,
} from '@neuralaunch/constants';

// Re-export the cross-app Zod schemas + types that DON'T need the
// client-only tool-session fields (canonical source:
// @neuralaunch/api-types).
export {
  TaskAdjustmentEntrySchema,
  type TaskAdjustmentEntry,
  RecommendedToolEntrySchema,
  type RecommendedToolEntry,
  RecalibrationOfferEntrySchema,
  type RecalibrationOfferEntry,
  CheckInEntrySchema,
  type CheckInEntry,
} from '@neuralaunch/api-types';

// ---------------------------------------------------------------------------
// Client-side StoredRoadmap schemas — extend the shared base schema
// with the four tool-session passthrough fields. See file-level
// comment above for why these stay off the shared schema.
// ---------------------------------------------------------------------------

export const StoredRoadmapTaskSchema = BaseStoredRoadmapTaskSchema.extend({
  coachSession:    z.object({}).passthrough().optional(),
  composerSession: z.object({}).passthrough().optional(),
  researchSession: z.object({}).passthrough().optional(),
  packagerSession: z.object({}).passthrough().optional(),
});
export type StoredRoadmapTask = z.infer<typeof StoredRoadmapTaskSchema>;

export const StoredRoadmapPhaseSchema = BaseStoredRoadmapPhaseSchema.extend({
  tasks: z.array(StoredRoadmapTaskSchema),
});
export type StoredRoadmapPhase = z.infer<typeof StoredRoadmapPhaseSchema>;

export const StoredPhasesArraySchema = z.array(StoredRoadmapPhaseSchema);

// ---------------------------------------------------------------------------
// Pure helpers — client-side domain logic that operates on the
// StoredRoadmap shapes. These do not move to the package because
// mobile doesn't need them and they have no server dependencies
// either way (they're just pure functions).
// ---------------------------------------------------------------------------

/**
 * Count how many tasks across all phases have at least one check-in
 * entry. Used by the check-in route to compute the coverage ratio
 * against RECALIBRATION_MIN_COVERAGE.
 */
export function countTasksWithCheckins(phases: StoredRoadmapPhase[]): number {
  let count = 0;
  for (const phase of phases) {
    for (const task of phase.tasks) {
      if (task.checkInHistory && task.checkInHistory.length > 0) {
        count++;
      }
    }
  }
  return count;
}

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
 * Whether a completed task still owes the founder an outcome-capture
 * check-in. The two-option completion surface (TaskCompletionMoment)
 * writes a CheckInEntry whenever the founder resolves it — either
 * "It went as planned" (source='success_criteria_confirmed') or
 * "Tell us how it went" (source='founder'). Before this helper
 * existed the surface lived only in client state, so refreshing the
 * page after toggling complete dropped the prompt and the task could
 * stay completed with zero outcome data. Deriving pending state from
 * (status, completedAt, checkInHistory) lets the hook re-seed the
 * banner on mount so the A12 invariant — every completion carries
 * outcome data — actually holds across refreshes.
 *
 * Rule: any entry with timestamp >= completedAt satisfies the
 * invariant. Re-completing a task does NOT bump completedAt (see
 * tasks/[taskId]/status/route.ts), so an attestation from the
 * task's first completion continues to count.
 */
export function isCompletionOutcomePending(task: StoredRoadmapTask): boolean {
  if (task.status !== 'completed') return false;
  if (!task.completedAt) return false;
  const completedAtMs = Date.parse(task.completedAt);
  if (Number.isNaN(completedAtMs)) return false;
  const history = task.checkInHistory ?? [];
  return !history.some(entry => {
    const entryMs = Date.parse(entry.timestamp);
    return !Number.isNaN(entryMs) && entryMs >= completedAtMs;
  });
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

/**
 * Compute elapsed-hours from startedAt → completedAt timestamps, with
 * one decimal of precision. Returns null when either timestamp is
 * missing or unparsable, or when the result is negative (clock skew /
 * out-of-order writes — record null instead of a misleading negative).
 * Added in PR 16-data — used by the mark-complete PATCH route to
 * populate task.actualHours on the transition into 'completed'.
 */
export function computeActualHours(
  startedAt:   string | null | undefined,
  completedAt: string | null | undefined,
): number | null {
  if (!startedAt || !completedAt) return null;
  const startMs = Date.parse(startedAt);
  const endMs   = Date.parse(completedAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  const hours = (endMs - startMs) / (1000 * 60 * 60);
  if (hours < 0) return null;
  return Math.round(hours * 10) / 10;
}

/**
 * Find every task whose `dependsOn` list is now fully satisfied by
 * the set of completed task ids, AND whose current status is
 * `blocked`. Returns the canonical task ids of those tasks. The
 * mark-complete route uses this to auto-clear `blockedReason` and
 * surface the unblocked ids to the client so the UI can flash them.
 * Tasks with no `dependsOn` are never returned (they were never
 * blocked by this mechanism). Added in PR 16-data.
 */
export function findNewlyUnblockedTaskIds(
  phases: StoredRoadmapPhase[],
  completedTaskIds: Set<string>,
): string[] {
  const unblocked: string[] = [];
  for (const phase of phases) {
    phase.tasks.forEach((task, idx) => {
      if (task.status !== 'blocked') return;
      const deps = task.dependsOn ?? [];
      if (deps.length === 0) return;
      const allMet = deps.every(d => completedTaskIds.has(d));
      if (!allMet) return;
      const id = task.id ?? `phase${phase.phase}-task${idx}`;
      unblocked.push(id);
    });
  }
  return unblocked;
}

/**
 * Collect the canonical task ids of every task currently in
 * `completed`. Pairs with {@link findNewlyUnblockedTaskIds}. Added
 * in PR 16-data.
 */
export function collectCompletedTaskIds(
  phases: StoredRoadmapPhase[],
): Set<string> {
  const out = new Set<string>();
  for (const phase of phases) {
    phase.tasks.forEach((task, idx) => {
      if (task.status !== 'completed') return;
      const id = task.id ?? `phase${phase.phase}-task${idx}`;
      out.add(id);
    });
  }
  return out;
}

/**
 * Sum every task's `actualHours` across the roadmap. Returns null
 * when no task has a recorded actualHours value (so the caller can
 * decide whether to render "n/a" vs "0h"). Powers the derived
 * weekly-hours figure on the roadmap GET endpoint. Added in PR
 * 16-data.
 */
export function sumActualHours(phases: StoredRoadmapPhase[]): number | null {
  let total = 0;
  let any = false;
  for (const phase of phases) {
    for (const task of phase.tasks) {
      if (typeof task.actualHours === 'number') {
        total += task.actualHours;
        any = true;
      }
    }
  }
  if (!any) return null;
  return Math.round(total * 10) / 10;
}
