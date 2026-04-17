'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskCompletionMoment.tsx
//
// The green-bordered acknowledgment block shown when a task flips to
// completed. Contains the A12 two-option outcome capture surface
// ("Tell us how it went" vs "It went as planned"). Pure
// presentational — all state and handlers are owned by the parent
// (InteractiveTaskCard).

import { motion } from 'motion/react';

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + '…';
}

export interface TaskCompletionMomentProps {
  taskTitle:        string;
  successCriteria:  string;
  founderGoal:      string | null;
  progress:         { totalTasks: number; completedTasks: number } | null;
  /** A12 two-option flow state — null hides the choice surface. */
  completionPath:   'choice' | 'writing' | null;
  submitting:       boolean;
  onChooseWriting:  () => void;
  onChooseAsPlanned: () => void;
  onDismiss:        () => void;
}

export function TaskCompletionMoment({
  taskTitle, successCriteria, founderGoal, progress,
  completionPath, submitting,
  onChooseWriting, onChooseAsPlanned, onDismiss,
}: TaskCompletionMomentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-success/30 bg-success/5 p-3 flex flex-col gap-2"
    >
      <p className="text-xs font-medium text-success">✓ {taskTitle}</p>
      <p className="text-[11px] text-foreground/80 leading-relaxed">
        You hit the success criteria: <span className="italic">{truncate(successCriteria, 200)}</span>.
      </p>
      {founderGoal && (
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          One step closer to your goal: {truncate(founderGoal, 140)}.
        </p>
      )}
      {progress && progress.totalTasks > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {progress.completedTasks} of {progress.totalTasks} tasks complete · {Math.round((progress.completedTasks / progress.totalTasks) * 100)}% through your roadmap
        </p>
      )}

      {/* A12 two-option outcome capture. Renders only while
          completionPath === 'choice'. Picking either button moves the
          founder forward — there is no path that leaves the completed
          task with zero outcome data. */}
      {completionPath === 'choice' && (
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-[11px] text-foreground/90 font-medium">How did this task actually go?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onChooseWriting}
              className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Tell us how it went
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onChooseAsPlanned}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              It went as planned
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            Skipping means the outcome matched the success criteria exactly.
          </p>
        </div>
      )}

      {completionPath === null && (
        <button
          type="button"
          onClick={onDismiss}
          className="self-start text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          Dismiss
        </button>
      )}
    </motion.div>
  );
}
