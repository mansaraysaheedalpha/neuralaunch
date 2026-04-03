// src/components/discovery/WelcomeLayer.tsx
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const INSIGHT_POOL = [
  'Most ideas fail validation because founders validate their solution, not the problem.',
  'A fundable idea solves a problem someone is already paying to fix — just badly.',
  'Talking to 10 customers before building saves months of building the wrong thing.',
  'Market sizing mistakes usually come from top-down guessing, not bottom-up counting.',
  'Conviction is tested by what you do when the first attempt fails, not by how you feel now.',
  'The riskiest assumption in most ideas is that people will pay — not that it can be built.',
  'Competitors existing is a signal the market is real. No competitors usually means no market.',
  'The best early customers are people who have already tried to solve the problem themselves.',
  'Scope creep at the idea stage kills more startups than technical debt ever will.',
  'Distribution is harder than the product. Most founders learn this too late.',
  'A good MVP answers one question: will people pay for this? Everything else is extra.',
  'The difference between a hobby and a business is whether strangers give you money.',
  'Talking to users is not market research — it is product development.',
  'Ideas that sound boring to outsiders often make the best businesses.',
  'Urgency matters more than interest. People buy what they need now, not what they want someday.',
  'The founder who ships something ugly in week 2 learns more than the one who plans for months.',
] as const;

const INTENT_CHIPS = [
  'Validate a new idea',
  'Refine my existing concept',
  'Research my competitors',
  'Scope my MVP',
] as const;

interface WelcomeLayerProps {
  firstName:    string;
  isVisible:    boolean;
  onChipClick:  (text: string) => void;
}

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  const name = firstName ? `, ${firstName}` : '';
  if (hour < 12) return `Good morning${name}`;
  if (hour < 17) return `Good afternoon${name}`;
  return `Good evening${name}`;
}

function getInsight(): string {
  const idx = Math.floor(Date.now() / (1000 * 60 * 60 * 4)) % INSIGHT_POOL.length;
  return INSIGHT_POOL[idx];
}

/**
 * WelcomeLayer
 *
 * Empty-state layer shown before the first message is sent.
 * Fades out permanently once the conversation starts.
 */
export function WelcomeLayer({ firstName, isVisible, onChipClick }: WelcomeLayerProps) {
  const [greeting, setGreeting] = useState('');
  const [insight,  setInsight]  = useState('');

  // Derive client-side only to avoid SSR mismatch
  useEffect(() => {
    setGreeting(getGreeting(firstName));
    setInsight(getInsight());
  }, [firstName]);

  return (
    <AnimatePresence>
      {isVisible && greeting && (
        <motion.div
          key="welcome"
          initial={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2, ease: 'easeIn' }}
          className="flex flex-col items-center justify-center flex-1 gap-6 px-6 pb-8 select-none"
        >
          {/* Greeting */}
          <h2 className="text-3xl font-semibold text-foreground tracking-tight text-center">
            {greeting}
          </h2>

          {/* Rotating insight block */}
          <div className="max-w-md w-full rounded-xl bg-muted/50 px-5 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed text-center">
              {insight}
            </p>
          </div>

          {/* Intent chips */}
          <div className="flex flex-wrap justify-center gap-2 max-w-lg">
            {INTENT_CHIPS.map(chip => (
              <button
                key={chip}
                type="button"
                onClick={() => onChipClick(chip)}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors duration-150"
              >
                {chip}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
