// src/components/discovery/PhaseIndicator.tsx
'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { InterviewPhase } from '@/lib/discovery/client';

const PHASES: Array<{ key: Exclude<InterviewPhase, 'SYNTHESIS'>; label: string }> = [
  { key: 'ORIENTATION',   label: 'Orientation' },
  { key: 'GOAL_CLARITY',  label: 'Goal Clarity' },
  { key: 'CONSTRAINT_MAP', label: 'Constraints' },
  { key: 'CONVICTION',    label: 'Conviction' },
];

const PHASE_ORDER: InterviewPhase[] = [
  'ORIENTATION',
  'GOAL_CLARITY',
  'CONSTRAINT_MAP',
  'CONVICTION',
  'SYNTHESIS',
];

interface PhaseIndicatorProps {
  currentPhase: InterviewPhase;
}

/**
 * PhaseIndicator
 *
 * Displays the 4 interview phases as a horizontal stepper.
 * Highlights the active phase and marks completed ones.
 * Accepts the current phase from X-Phase response headers.
 */
export function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);

  return (
    <nav aria-label="Interview progress" className="flex items-center gap-0 w-full max-w-xl mx-auto px-4">
      {PHASES.map((phase, idx) => {
        const phaseIndex = PHASE_ORDER.indexOf(phase.key);
        const isCompleted = phaseIndex < currentIndex;
        const isActive    = phase.key === currentPhase;

        return (
          <div key={phase.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <motion.div
                layout
                animate={{
                  backgroundColor: isCompleted
                    ? 'var(--primary)'
                    : isActive
                    ? 'var(--primary)'
                    : 'var(--muted)',
                  scale: isActive ? 1.15 : 1,
                }}
                transition={{ duration: 0.35 }}
                className={cn(
                  'size-3 rounded-full',
                  isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                )}
              />
              <motion.span
                animate={{ opacity: isActive ? 1 : isCompleted ? 0.75 : 0.4 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  'text-[10px] font-medium whitespace-nowrap',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {phase.label}
              </motion.span>
            </div>

            {idx < PHASES.length - 1 && (
              <motion.div
                className="h-px flex-1 mx-1 mt-[-14px]"
                animate={{ backgroundColor: isCompleted ? 'var(--primary)' : 'var(--border)' }}
                transition={{ duration: 0.4 }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
