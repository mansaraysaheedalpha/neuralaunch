'use client';
// src/app/(app)/discovery/roadmap/[id]/PhaseBlock.tsx

import { useState } from 'react';
import { motion } from 'motion/react';
import type { RoadmapPhase } from '@/lib/roadmap';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';
import { InteractiveTaskCard } from './InteractiveTaskCard';

export interface PhaseBlockProps {
  phase:            RoadmapPhase;
  index:            number;
  roadmapId:        string;
  founderGoal:      string | null;
  progress:         { totalTasks: number; completedTasks: number } | null;
  onOutcomePromptDue?: () => void;
}

/**
 * PhaseBlock — single phase rendered as a numbered heading + objective
 * + an accordion of InteractiveTaskCards.
 *
 * Owns the per-phase "which task is expanded" state. Only one task per
 * phase shows its full surface at a time; the rest render as compact
 * rows. Clicking a collapsed task expands it (and collapses whichever
 * was previously expanded). Clicking the currently-expanded task's
 * row collapses it again.
 *
 * Default expanded task = first non-completed task in the phase. If
 * every task is completed, no task is expanded by default — the
 * founder is presumed to be reviewing past work.
 */
export function PhaseBlock({
  phase,
  index,
  roadmapId,
  founderGoal,
  progress,
  onOutcomePromptDue,
}: PhaseBlockProps) {
  // Default-expand the first not-yet-completed task in the phase. If
  // every task is completed, default to no expanded task (-1).
  const tasks = phase.tasks as StoredRoadmapTask[];
  const defaultExpanded = tasks.findIndex(t => t.status !== 'completed');
  const [expandedIndex, setExpandedIndex] = useState<number>(defaultExpanded);

  const handleToggle = (i: number) => {
    setExpandedIndex(prev => (prev === i ? -1 : i));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start gap-3.5">
        {/* Phase badge — gold-tinted size-9 square. Gold reads as a
            chapter milestone; primary stays for tasks within. */}
        <div className="flex-shrink-0 size-9 rounded-lg border border-gold/30 bg-gold/10 text-gold text-sm font-bold flex items-center justify-center">
          {phase.phase}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground tracking-tight">{phase.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{phase.objective}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            {phase.durationWeeks} week{phase.durationWeeks !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className="ml-12 flex flex-col gap-2">
        {tasks.map((task, i) => (
          <InteractiveTaskCard
            key={i}
            task={task}
            index={i}
            phaseNumber={phase.phase}
            roadmapId={roadmapId}
            founderGoal={founderGoal}
            progress={progress}
            isExpanded={expandedIndex === i}
            onToggle={() => handleToggle(i)}
            onOutcomePromptDue={onOutcomePromptDue}
          />
        ))}
      </div>
    </motion.div>
  );
}
