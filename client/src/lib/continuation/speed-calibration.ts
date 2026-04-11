// src/lib/continuation/speed-calibration.ts
//
// Pure helper that derives execution metrics from a roadmap's stored
// state. The brief generator uses these to ground its calibrated
// time estimates in the founder's actual pace, not their stated
// availability. Persisted to Roadmap.executionMetrics so the
// next-cycle roadmap engine (Phase 6) can read them without
// re-deriving.

import 'server-only';
import type { StoredRoadmapPhase } from '@/lib/roadmap/checkin-types';

/**
 * Loose time-estimate parser. Mirrors parseTimeEstimateToMs in the
 * roadmap-nudge function — duplicated rather than imported because
 * the nudge function is an Inngest entry point, not a library, and
 * a forward dependency from continuation/ to inngest/ would break
 * the layering.
 *
 * Recognises "weeks", "days", "hours", "minutes" with optional
 * decimals. Returns null when the string contains no recognisable
 * time unit so the caller can drop the task from accuracy stats.
 */
const TIME_UNIT_PATTERNS: Array<{ regex: RegExp; ms: number }> = [
  { regex: /(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)\b/i,    ms: 7  * 24 * 60 * 60 * 1000 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:days?)\b/i,           ms:      24 * 60 * 60 * 1000 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i,    ms:           60 * 60 * 1000 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i, ms:                60 * 1000 },
];

function parseTimeEstimateToMs(text: string): number | null {
  for (const { regex, ms } of TIME_UNIT_PATTERNS) {
    const m = text.match(regex);
    if (m) {
      const value = parseFloat(m[1]);
      if (Number.isFinite(value)) return value * ms;
    }
  }
  return null;
}

const HOURS_IN_MS = 60 * 60 * 1000;
const DAYS_IN_MS  = 24 * HOURS_IN_MS;

/**
 * Snapshot of the founder's actual execution pace, captured at
 * brief-generation time. Persisted to Roadmap.executionMetrics so
 * downstream consumers can read it without re-derivation.
 */
export interface ExecutionMetrics {
  /** What the founder told us they had per week, from the belief state. */
  statedWeeklyHours: number;
  /**
   * Hours per week computed from sum-of-completed-task-estimates
   * divided by elapsed weeks. Null when there is no completed work
   * or no elapsed time to divide by.
   */
  derivedWeeklyHours: number | null;
  /** Total estimated hours the founder has actually completed. */
  totalEstimatedHoursCompleted: number;
  /** Days from roadmap creation to evaluation time. */
  daysSinceCreation: number;
  /** Days since the most recent activity, or null when never active. */
  daysSinceLastActivity: number | null;
  /** Counts (mirror of RoadmapProgress for self-contained metrics). */
  tasksCompleted: number;
  tasksBlocked:   number;
  tasksTotal:     number;
  /**
   * Pattern label the prompt uses to phrase the calibration:
   *   - 'on_pace'      derived ≥ 0.8 × stated
   *   - 'slower_pace'  derived < 0.8 × stated
   *   - 'unknown'      not enough data to compute derived hours
   */
  paceLabel: 'on_pace' | 'slower_pace' | 'unknown';
  /**
   * Pre-rendered human-readable note ready for the brief prompt and
   * the next-cycle roadmap prompt. The label encodes the same signal
   * as paceLabel but in a sentence the LLM can quote directly.
   */
  paceNote: string;
}

/**
 * Compute execution metrics from a stored roadmap and its progress
 * row. Pure — does not touch the database, makes no LLM calls.
 *
 * The function is intentionally generous with `null` returns: when
 * there is not enough data to compute a metric honestly, it returns
 * null rather than guessing. The brief prompt is built to handle
 * either case.
 */
export function computeExecutionMetrics(input: {
  phases:            StoredRoadmapPhase[];
  statedWeeklyHours: number;
  createdAt:         Date;
  lastActivityAt:    Date | null;
  evaluatedAt?:      Date;
}): ExecutionMetrics {
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const daysSinceCreation = Math.max(
    0,
    Math.floor((evaluatedAt.getTime() - input.createdAt.getTime()) / DAYS_IN_MS),
  );
  const daysSinceLastActivity = input.lastActivityAt
    ? Math.max(0, Math.floor((evaluatedAt.getTime() - input.lastActivityAt.getTime()) / DAYS_IN_MS))
    : null;

  let tasksCompleted = 0;
  let tasksBlocked   = 0;
  let tasksTotal     = 0;
  let totalCompletedMs = 0;

  // Per-task duration aggregation for the precise pace calculation.
  // We sum BOTH the estimated hours and the actual wall-clock days
  // for tasks that have a parseable time estimate AND both startedAt
  // and completedAt timestamps. The aggregate ratio gives a weighted
  // average implied weekly hours that is robust to outliers (one
  // long task naturally counts more than one short task).
  let perTaskEstimatedHours = 0;
  let perTaskActualDays     = 0;
  let perTaskSampleCount    = 0;

  for (const phase of input.phases) {
    for (const task of phase.tasks) {
      tasksTotal++;
      const status = task.status ?? 'not_started';
      if (status === 'completed') {
        tasksCompleted++;
        const estimateMs = parseTimeEstimateToMs(task.timeEstimate);
        if (estimateMs != null) totalCompletedMs += estimateMs;

        // Per-task precise duration: only when both timestamps exist
        // (legacy tasks predating the startedAt field skip this branch
        // and contribute only to the roadmap-level fallback below).
        if (estimateMs != null && task.startedAt && task.completedAt) {
          const startedMs   = new Date(task.startedAt).getTime();
          const completedMs = new Date(task.completedAt).getTime();
          const actualMs    = completedMs - startedMs;
          // Sanity bound: a task completed in less than 1 hour of
          // wall-clock either had its startedAt set retroactively or
          // was a very fast task we cannot calibrate from. Skip those
          // — they would distort the implied rate sharply upward.
          if (actualMs >= HOURS_IN_MS) {
            perTaskEstimatedHours += estimateMs / HOURS_IN_MS;
            perTaskActualDays     += actualMs   / DAYS_IN_MS;
            perTaskSampleCount    += 1;
          }
        }
      } else if (status === 'blocked') {
        tasksBlocked++;
      }
    }
  }

  const totalEstimatedHoursCompleted = totalCompletedMs / HOURS_IN_MS;

  // Derive weekly pace. Two sources, in priority order:
  //
  //   1. Per-task aggregate (PRECISE). For each completed task with
  //      both startedAt and completedAt, sum estimated hours and
  //      actual wall-clock days. The implied rate is
  //      (estimated hours / actual days) × 7 = implied hours/week.
  //      Treats one long task as more signal than one short task.
  //
  //   2. Roadmap-level approximation (FALLBACK). For roadmaps
  //      generated before the startedAt field was added, no task
  //      has the timestamp pair. Fall back to the prior derivation:
  //      total estimated hours completed / weeks since roadmap
  //      created. Coarser but always available.
  //
  // The brief prompt cannot tell which source produced the number;
  // both are reported as `derivedWeeklyHours` and the pace label
  // logic stays unchanged.
  let derivedWeeklyHours: number | null = null;
  if (perTaskSampleCount > 0 && perTaskActualDays > 0) {
    const impliedHoursPerWeek = (perTaskEstimatedHours / perTaskActualDays) * 7;
    derivedWeeklyHours = Number(impliedHoursPerWeek.toFixed(1));
  } else if (daysSinceCreation >= 1 && totalEstimatedHoursCompleted >= 1) {
    const weeks = Math.max(daysSinceCreation / 7, 1 / 7);
    derivedWeeklyHours = Number((totalEstimatedHoursCompleted / weeks).toFixed(1));
  }

  // Pace label and note for the prompt.
  let paceLabel: ExecutionMetrics['paceLabel'] = 'unknown';
  let paceNote = `The founder told us they had ${input.statedWeeklyHours} hours per week. Not enough completed work to derive an actual pace yet.`;

  if (derivedWeeklyHours != null) {
    const ratio = derivedWeeklyHours / Math.max(input.statedWeeklyHours, 1);
    if (ratio >= 0.8) {
      paceLabel = 'on_pace';
      paceNote = `The founder told us they had ${input.statedWeeklyHours} hours per week and is operating at ${derivedWeeklyHours} hours per week — within 20% of stated. Calibrate the next roadmap on the original pace.`;
    } else {
      paceLabel = 'slower_pace';
      paceNote = `The founder told us they had ${input.statedWeeklyHours} hours per week but is actually operating at about ${derivedWeeklyHours} hours per week — meaningfully slower than stated. The next roadmap MUST be calibrated to ~${derivedWeeklyHours} hours per week, and the calibration should be stated explicitly to the founder so it does not feel like a silent correction.`;
    }
  }

  return {
    statedWeeklyHours: input.statedWeeklyHours,
    derivedWeeklyHours,
    totalEstimatedHoursCompleted: Number(totalEstimatedHoursCompleted.toFixed(1)),
    daysSinceCreation,
    daysSinceLastActivity,
    tasksCompleted,
    tasksBlocked,
    tasksTotal,
    paceLabel,
    paceNote,
  };
}
