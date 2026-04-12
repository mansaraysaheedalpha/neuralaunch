'use client';
// src/app/(app)/discovery/roadmap/[id]/NudgeBanner.tsx

import { motion } from 'motion/react';
import type { RoadmapPhase } from '@/lib/roadmap';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';

/**
 * Walk the phases in order and return the first task whose status is
 * 'in_progress'. Used by the proactive nudge banner to name what the
 * founder was working on. Tasks default to 'not_started' when the
 * status field is absent — generated-but-not-yet-touched tasks never
 * trip this.
 */
function findFirstInProgressTask(phases: RoadmapPhase[]): { title: string } | null {
  for (const phase of phases) {
    for (const task of phase.tasks) {
      const status = (task as StoredRoadmapTask).status;
      if (status === 'in_progress') return { title: task.title };
    }
  }
  return null;
}

/**
 * NudgeBanner — extracted from RoadmapView to keep the orchestrator
 * under the 200-line cap. Renders the proactive nudge banner set by
 * the daily Inngest sweep when an in-progress task has gone stale.
 *
 * A11: prefers `staleTaskTitle` from RoadmapProgress when present
 * (the cron sweep now persists the exact title of the task it
 * flagged). Falls back to `findFirstInProgressTask` for legacy rows
 * flagged before the staleTaskTitle column was added.
 */
export function NudgeBanner({
  phases,
  staleTaskTitle,
}: {
  phases:         RoadmapPhase[];
  staleTaskTitle: string | null;
}) {
  const fallbackTask  = findFirstInProgressTask(phases);
  const taskTitle     = staleTaskTitle ?? fallbackTask?.title ?? null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col gap-2"
    >
      <p className="text-[10px] uppercase tracking-widest text-primary/70">
        Quick check-in
      </p>
      <p className="text-xs text-foreground leading-relaxed">
        {taskTitle
          ? `You were working on "${taskTitle}". How did it go?`
          : 'You have not updated your roadmap in a while. How is it going?'}
      </p>
      {taskTitle && (
        <p className="text-[11px] text-muted-foreground">
          Tap any task below to share an update or report a blocker.
        </p>
      )}
    </motion.div>
  );
}
