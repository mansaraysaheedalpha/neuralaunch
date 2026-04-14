// src/components/roadmap/task-constants.ts
//
// Shared constants for the task UI — status labels, Badge variants,
// and the canonical taskId format.

import type { TaskStatus } from '@/hooks/useRoadmap';

export const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'blocked',     label: 'Blocked' },
];

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
