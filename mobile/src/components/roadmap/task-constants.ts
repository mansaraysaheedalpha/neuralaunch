// src/components/roadmap/task-constants.ts
//
// Shared constants for the task UI — status labels, Badge variants,
// and the canonical taskId format.

import { TASK_STATUSES, type TaskStatus } from '@neuralaunch/constants';

// Enum values sourced from @neuralaunch/constants so mobile and the
// client server can't drift. Labels remain in mobile because they
// are UI-layer concerns.
const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed:   'Completed',
  blocked:     'Blocked',
};

export const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> =
  TASK_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));

export const STATUS_VARIANTS: Record<
  TaskStatus,
  'muted' | 'primary' | 'success' | 'destructive'
> = {
  not_started: 'muted',
  in_progress: 'primary',
  completed:   'success',
  blocked:     'destructive',
};

export function buildTaskId(phaseNumber: number, taskIndex: number): string {
  return `p${phaseNumber}t${taskIndex}`;
}
