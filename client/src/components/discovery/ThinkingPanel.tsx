// src/components/discovery/ThinkingPanel.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain } from 'lucide-react';

const STEPS = [
  'Analysing your context',
  'Weighing options',
  'Generating recommendation',
] as const;

const STEP_DURATION_MS = 2800;

interface ThinkingPanelProps {
  isVisible: boolean;
}

/**
 * ThinkingPanel
 *
 * Displays a 3-step animated indicator during recommendation synthesis.
 * Shown when the backend transitions to SYNTHESIS phase.
 */
export function ThinkingPanel({ isVisible }: ThinkingPanelProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }, STEP_DURATION_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="thinking-panel"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-5 py-8"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="text-primary"
          >
            <Brain className="size-8" />
          </motion.div>

          <div className="flex flex-col items-center gap-2">
            {STEPS.map((step, idx) => (
              <motion.div
                key={step}
                animate={{
                  opacity: idx <= currentStep ? 1 : 0.3,
                  scale: idx === currentStep ? 1.03 : 1,
                }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-2 text-sm"
              >
                <motion.span
                  animate={{ backgroundColor: idx < currentStep ? 'var(--primary)' : idx === currentStep ? 'var(--primary)' : 'var(--muted)' }}
                  className="size-2 rounded-full inline-block"
                />
                <span className={idx <= currentStep ? 'text-foreground' : 'text-muted-foreground'}>
                  {step}
                </span>
                {idx < currentStep && (
                  <span className="text-primary text-xs">✓</span>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
