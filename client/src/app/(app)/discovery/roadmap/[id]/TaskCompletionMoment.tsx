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
      className="flex flex-col gap-2 border-l-2 border-success bg-bg-2 px-4 py-3"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
        ✓ Completed · {truncate(taskTitle, 60)}
      </p>
      <p className="text-[13px] leading-[1.6] text-fg-2">
        You hit the success criteria: <em className="font-serif text-fg">{truncate(successCriteria, 200)}</em>.
      </p>
      {founderGoal && (
        <p className="text-[13px] leading-[1.6] text-fg-2">
          One step closer to your goal — {truncate(founderGoal, 140)}.
        </p>
      )}
      {progress && progress.totalTasks > 0 && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {progress.completedTasks} / {progress.totalTasks} tasks · {Math.round((progress.completedTasks / progress.totalTasks) * 100)}% through the roadmap
        </p>
      )}

      {/* A12 two-option outcome capture. Renders only while
          completionPath === 'choice'. Either button moves the founder
          forward — no path leaves the completed task with zero
          outcome data. */}
      {completionPath === 'choice' && (
        <div className="flex flex-col gap-2 pt-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            How did this task actually go?
          </p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={onChooseWriting}
              className="inline-flex items-center gap-2 bg-accent px-3.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
            >
              Tell us how it went
              <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onChooseAsPlanned}
              className="border border-rule-strong px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              It went as planned
            </button>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Skipping means the outcome matched the success criteria exactly.
          </p>
        </div>
      )}

      {completionPath === null && (
        <button
          type="button"
          onClick={onDismiss}
          className="self-start font-mono text-[10px] uppercase tracking-[0.14em] text-muted underline underline-offset-2 transition-colors hover:text-fg"
        >
          Dismiss
        </button>
      )}
    </motion.div>
  );
}
