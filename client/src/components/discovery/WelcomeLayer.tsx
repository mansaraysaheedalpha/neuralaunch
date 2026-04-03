// src/components/discovery/WelcomeLayer.tsx
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const QUESTION_POOL = [
  'What problem are you trying to solve, and who wakes up every day frustrated by it?',
  'If you could not raise funding, what is the smallest version of this you could charge for next week?',
  'Have you talked to anyone who has this problem? What did they actually tell you?',
  'What are people doing right now to solve this problem, and why is that not enough?',
  'Who is the one person who would pay for this before it is finished — and why them specifically?',
  'Is the problem urgent, or just interesting? What is the difference for your target customer?',
  'What does success look like in 90 days — not eventually, but in 90 days?',
  'How do you know this is a real problem and not just one you personally have?',
  'Who is your first customer — not the ideal one, the first one you would call tomorrow?',
  'What is the riskiest assumption in your idea right now? Have you tested it?',
  'What would make you abandon this idea? If nothing comes to mind, what does that tell you?',
  'What does the competitive landscape tell you about whether this market is real?',
  'If you built this and nobody paid for it, what would you have learned?',
  'What is the one thing that, if you got it wrong, would make everything else irrelevant?',
  'What do you want to build — and is that the same thing as what people actually need?',
  'What existing behaviour are you trying to change, and how hard has that proven to be for others?',
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

/**
 * WelcomeLayer
 *
 * Empty-state layer shown before the first message is sent.
 * Displays a time-aware greeting and a randomly selected discovery
 * question (changes on every page load) scoped to NeuraLaunch's purpose.
 * Fades out permanently once the conversation starts.
 */
export function WelcomeLayer({ firstName, isVisible, onChipClick }: WelcomeLayerProps) {
  const [greeting,  setGreeting]  = useState('');
  const [question,  setQuestion]  = useState('');

  // Derived client-side only to avoid SSR mismatch.
  // Question randomises on every mount (page load / navigation).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(getGreeting(firstName));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuestion(QUESTION_POOL[Math.floor(Math.random() * QUESTION_POOL.length)]);
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

          {/* Rotating discovery question */}
          <div className="max-w-md w-full rounded-xl bg-muted/50 px-5 py-4 space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest text-center">
              Think about this
            </p>
            <p className="text-sm text-foreground/80 leading-relaxed text-center">
              {question}
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
