'use client';
// src/app/(app)/discovery/roadmap/[id]/PhaseBlock.tsx

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
 * PhaseBlock — single phase in the roadmap, rendered as a numbered
 * heading + objective + a stack of InteractiveTaskCards. The phase
 * itself owns no state; everything reactive lives in the cards.
 */
export function PhaseBlock({
  phase,
  index,
  roadmapId,
  founderGoal,
  progress,
  onOutcomePromptDue,
}: PhaseBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 size-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
          {phase.phase}
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{phase.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{phase.objective}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {phase.durationWeeks} week{phase.durationWeeks !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className="ml-10 flex flex-col gap-2">
        {phase.tasks.map((task, i) => (
          <InteractiveTaskCard
            key={i}
            task={task as StoredRoadmapTask}
            index={i}
            phaseNumber={phase.phase}
            roadmapId={roadmapId}
            founderGoal={founderGoal}
            progress={progress}
            onOutcomePromptDue={onOutcomePromptDue}
          />
        ))}
      </div>
    </motion.div>
  );
}
