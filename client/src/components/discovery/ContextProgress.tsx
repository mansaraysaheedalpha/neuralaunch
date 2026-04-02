// src/components/discovery/ContextProgress.tsx
'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { MAX_QUESTIONS_PER_PHASE, MAX_TOTAL_QUESTIONS } from '@/lib/discovery';
import type { InterviewPhase } from '@/lib/discovery';

type ActivePhase = Exclude<InterviewPhase, 'SYNTHESIS'>;

const PHASE_SEGMENTS: Array<{ key: ActivePhase; max: number }> = [
  { key: 'ORIENTATION',    max: MAX_QUESTIONS_PER_PHASE.ORIENTATION },
  { key: 'GOAL_CLARITY',   max: MAX_QUESTIONS_PER_PHASE.GOAL_CLARITY },
  { key: 'CONSTRAINT_MAP', max: MAX_QUESTIONS_PER_PHASE.CONSTRAINT_MAP },
  { key: 'CONVICTION',     max: MAX_QUESTIONS_PER_PHASE.CONVICTION },
];

// Cumulative question counts at the start of each phase
const PHASE_START: Record<ActivePhase, number> = {
  ORIENTATION:    0,
  GOAL_CLARITY:   MAX_QUESTIONS_PER_PHASE.ORIENTATION,
  CONSTRAINT_MAP: MAX_QUESTIONS_PER_PHASE.ORIENTATION + MAX_QUESTIONS_PER_PHASE.GOAL_CLARITY,
  CONVICTION:     MAX_QUESTIONS_PER_PHASE.ORIENTATION + MAX_QUESTIONS_PER_PHASE.GOAL_CLARITY + MAX_QUESTIONS_PER_PHASE.CONSTRAINT_MAP,
};

interface ContextProgressProps {
  questionCount: number;
  currentPhase: InterviewPhase;
}

/**
 * ContextProgress
 *
 * Subtle per-phase progress visualisation.
 * Segments fill based on the X-Question-Count header value.
 */
export function ContextProgress({ questionCount, currentPhase }: ContextProgressProps) {
  const cappedCount = Math.min(questionCount, MAX_TOTAL_QUESTIONS);

  return (
    <div
      aria-label="Context completeness"
      className="flex gap-1 w-full max-w-xl mx-auto px-4"
    >
      {PHASE_SEGMENTS.map(({ key, max }) => {
        const start    = PHASE_START[key];
        const end      = start + max;
        const filled   = Math.max(0, Math.min(cappedCount - start, max));
        const pct      = filled / max;
        const isActive = key === currentPhase;
        const isDone   = cappedCount >= end || currentPhase === 'SYNTHESIS';

        return (
          <div
            key={key}
            className={cn(
              'relative flex-1 h-1 rounded-full overflow-hidden',
              'bg-border/60'
            )}
          >
            <motion.div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                isDone   ? 'bg-primary'     :
                isActive ? 'bg-primary/70'  :
                           'bg-muted-foreground/30'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${pct * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        );
      })}
    </div>
  );
}
