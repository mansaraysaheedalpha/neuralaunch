'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchProgressIndicator.tsx
//
// Animated progress indicator shown during research execution.
// Replaces a static spinner with an animated "Researching..." state.
// Progress updates from the route will be streamed in a future enhancement.

import { motion } from 'motion/react';

export interface ResearchProgressIndicatorProps {
  active: boolean;
}

/**
 * ResearchProgressIndicator
 *
 * Renders an animated "Researching..." indicator while the research
 * execution route is running. Displays animated dots to communicate
 * that work is in progress. Unmounts cleanly when `active` is false.
 */
export function ResearchProgressIndicator({ active }: ResearchProgressIndicatorProps) {
  if (!active) return null;

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            className="block size-2 rounded-full bg-primary"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
            transition={{
              duration:   1.2,
              repeat:     Infinity,
              delay:      i * 0.2,
              ease:       'easeInOut',
            }}
          />
        ))}
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Researching…</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Deep research takes 2–6 minutes. The quality is worth the wait.
        </p>
      </div>
    </div>
  );
}
