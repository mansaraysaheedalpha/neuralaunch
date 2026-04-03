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
  'What has already been tried in this space, and why did it not stick?',
  'If your best potential customer solved this problem themselves tomorrow, how would they do it?',
  'What is the unit of value you are selling — time saved, money made, pain removed?',
  'Who loses if your idea succeeds? Understanding that tells you where resistance will come from.',
  'What does your customer do in the ten minutes before and after they feel this problem?',
  'What would have to be true about the market for this to be a ten-million-dollar business?',
  'How often does this problem happen, and how bad does it feel each time?',
  'What is the single sentence that explains why someone would switch from what they do today?',
  'Are you building something people want, or something they say they want when asked?',
  'What would a person have to believe to choose your solution over doing nothing?',
  'Where does your target customer already spend money trying to fix this problem?',
  'What does the person who most desperately needs this look like — what is their day like?',
  'How will you find your first ten customers, and what will you say to them?',
  'What is the smallest experiment that would prove or disprove your core assumption?',
  'If a direct competitor launched tomorrow with more funding, what is your defensible advantage?',
  'What does the world look like in three years if this works exactly as you imagine?',
  'What are you assuming about your customer that you have not yet verified?',
  'Is the pain you are solving a vitamin or a painkiller? How do you know?',
  'What is the one metric that, if it moved, would tell you this is working?',
  'What would make someone refer this to a friend — and do they feel that way yet?',
  'What does the customer already use as a workaround, and what does that tell you about pricing?',
  'How does the problem change depending on the size or type of customer you target?',
  'What is the cheapest way to simulate your solution before you build anything?',
  'What assumption are you most emotionally attached to — and is that a warning sign?',
  'What does your ideal customer fear more than anything when thinking about this problem?',
  'If you had to charge three times what you planned from day one, who would still pay?',
  'What feedback have you received that you dismissed — and should you revisit it?',
  'What is the difference between the customer who tries this and the one who stays?',
  'Who in your life would tell you honestly if this idea was not good enough — and have you asked?',
  'What do early adopters need that mainstream customers do not, and are you ready for that gap?',
  'What does progress look like at week four, week twelve, and week fifty-two?',
  'Is the timing right for this idea — what has changed recently that makes it possible now?',
  'What part of the problem are you solving because it is important versus because it is easy to build?',
] as const;

const INTENT_CHIPS = [
  'Validate an idea',
  'Refine my concept',
  'Research competitors',
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
          className="flex flex-col items-center gap-6 w-full select-none"
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

          {/* Intent chips — single row */}
          <div className="flex flex-nowrap justify-center gap-2">
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
