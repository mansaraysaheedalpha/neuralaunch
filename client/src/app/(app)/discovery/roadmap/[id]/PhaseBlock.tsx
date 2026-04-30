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
      transition={{ delay: index * 0.06, duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start gap-3.5">
        {/* Phase badge — bumped from size-7 primary/10 to size-9 gold-
            tinted ring + gold text. Gold reads as a chapter milestone
            ("a phase of the journey") while primary stays for tasks
            within the chapter. The size lift gives the most important
            hierarchy signal of the roadmap the visual weight it
            deserves, matching the numbered tile-badges we shipped on
            the recommendation page's First Three Steps. */}
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
