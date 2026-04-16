/**
 * Check-in domain constants — shared between the client (check-in agent,
 * roadmap rendering, status patcher) and mobile (task cards, check-in
 * forms, history rendering).
 *
 * The Zod schemas that depend on these constants
 * (CheckInEntrySchema, StoredRoadmapTaskSchema, etc.) live in the
 * @neuralaunch/api-types package — they import the constants from here.
 */

// ---------------------------------------------------------------------------
// Status + category enum value lists
// ---------------------------------------------------------------------------

export const TASK_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'blocked',
] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const CHECKIN_CATEGORIES = [
  'completed',
  'blocked',
  'unexpected',
  'question',
] as const;
export type CheckInCategory = typeof CHECKIN_CATEGORIES[number];

/**
 * Provenance of a check-in entry's free-text content. The two-option
 * completion flow allows the founder to either write their own
 * outcome ('founder') or accept the success criteria as the outcome
 * by clicking "It went as planned" ('success_criteria_confirmed').
 * Task-level diagnostic entries are stored in the same checkInHistory
 * array as scheduled check-ins but tagged with 'task_diagnostic' so
 * the check-in history list, the structured signals extractor, and
 * the conversation arc summariser can distinguish the two channels.
 */
export const CHECKIN_ENTRY_SOURCES = [
  'founder',
  'success_criteria_confirmed',
  'task_diagnostic',
] as const;
export type CheckInEntrySource = typeof CHECKIN_ENTRY_SOURCES[number];

/**
 * Action label set by the check-in agent on its structured response.
 * Stored on every CheckInEntry as audit + future training signal.
 *
 * `flagged_fundamental` was removed — a single blocker on a single task
 * is a task-level problem, not a recommendation-level problem. If a
 * blocker is truly fundamental, the pattern surfaces across multiple
 * check-ins and triggers the recalibration offer instead.
 */
export const CHECKIN_AGENT_ACTIONS = [
  'acknowledged',
  'adjusted_next_step',
  'adjusted_roadmap',
] as const;
export type CheckInAgentAction = typeof CHECKIN_AGENT_ACTIONS[number];

// ---------------------------------------------------------------------------
// Check-in conversation limits
// ---------------------------------------------------------------------------

/** Hard cap on per-task check-in conversation rounds. */
export const CHECKIN_HARD_CAP_ROUND = 5;

/**
 * Minimum task-coverage ratio (tasks with at least one check-in /
 * total tasks) before a recalibration offer is allowed to surface to
 * the founder. Below this threshold there isn't enough evidence to
 * trust the agent's "this might be the wrong direction" pattern
 * detection.
 */
export const RECALIBRATION_MIN_COVERAGE = 0.4;
