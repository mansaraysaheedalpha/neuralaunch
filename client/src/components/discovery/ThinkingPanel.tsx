// src/components/discovery/ThinkingPanel.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Each key maps to a synthesisStep value written by the Inngest function.
// Labels are what the user sees — written to reflect the real work happening.
const STEPS = [
  { key: 'loading',      label: 'Reading your answers'          },
  { key: 'summarising',  label: 'Understanding your situation'  },
  { key: 'evaluating',   label: 'Identifying the right path'    },
  { key: 'researching',  label: 'Researching your market'       },
  { key: 'synthesising', label: 'Building your recommendation'  },
] as const;

type StepKey = typeof STEPS[number]['key'];
const STEP_KEYS: readonly StepKey[] = STEPS.map(s => s.key) as StepKey[];

// Timer only runs when live step data hasn't arrived yet — caps at step 1
// so it never gets ahead of what the backend is actually doing.
const FALLBACK_STEP_DURATION_MS = 2500;
const FALLBACK_STEP_CAP = 1;

interface ThinkingPanelProps {
  isVisible:      boolean;
  synthesisError?: boolean;
  synthesisStep?:  string | null;
  onRetry?:        () => void;
}

/**
 * ThinkingPanel
 *
 * Shows real-time synthesis progress during recommendation generation.
 * Each step label corresponds to a real Inngest pipeline step — progress
 * is driven by synthesisStep values written to the DB and returned by the
 * recommendation polling endpoint. A timer fallback runs for the first few
 * seconds before the first live update arrives.
 */
export function ThinkingPanel({ isVisible, synthesisError, synthesisStep, onRetry }: ThinkingPanelProps) {
  const [fallbackStep, setFallbackStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const liveIdx   = synthesisStep ? STEP_KEYS.indexOf(synthesisStep as StepKey) : -1;
  const activeIdx = liveIdx >= 0 ? liveIdx : fallbackStep;

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!isVisible || liveIdx >= 0) {
      // Live data arrived — stop fallback timer. Reset on hide.
      if (!isVisible) setFallbackStep(0);
      return;
    }

    // No live data yet — slowly advance through first two steps as a placeholder
    intervalRef.current = setInterval(() => {
      setFallbackStep(prev => Math.min(prev + 1, FALLBACK_STEP_CAP));
    }, FALLBACK_STEP_DURATION_MS);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isVisible, liveIdx]);

  return (
    <AnimatePresence>
      {isVisible && !synthesisError && (
        <motion.div
          key="thinking-panel"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-6 py-10"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="text-primary"
          >
            <Brain className="size-8" />
          </motion.div>

          <div className="flex flex-col items-center gap-3">
            {STEPS.map((step, idx) => {
              const isDone    = idx < activeIdx;
              const isActive  = idx === activeIdx;
              const isPending = idx > activeIdx;

              return (
                <motion.div
                  key={step.key}
                  animate={{ opacity: isPending ? 0.3 : 1, scale: isActive ? 1.03 : 1 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center gap-2.5 text-sm"
                >
                  {isDone ? (
                    <span className="size-2 rounded-full bg-primary inline-block shrink-0" />
                  ) : isActive ? (
                    <motion.span
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="size-2 rounded-full bg-primary inline-block shrink-0"
                    />
                  ) : (
                    <span className="size-2 rounded-full bg-muted inline-block shrink-0" />
                  )}

                  <span className={isPending ? 'text-muted-foreground' : 'text-foreground'}>
                    {step.label}
                  </span>

                  {isDone && <span className="text-primary text-xs">✓</span>}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {synthesisError && (
        <motion.div
          key="thinking-error"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4 py-8"
        >
          <AlertCircle className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Something went wrong generating your recommendation. Please try again.
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
