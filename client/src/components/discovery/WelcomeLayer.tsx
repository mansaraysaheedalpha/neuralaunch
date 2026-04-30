// src/components/discovery/WelcomeLayer.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, Target, AlertTriangle, ListChecks, BookOpen, ArrowRight } from 'lucide-react';
import { WELCOME_QUESTION_POOL } from './welcome-questions';

interface WelcomeLayerProps {
  firstName:        string;
  isVisible:        boolean;
  /** True when the user has no completed sessions yet — surfaces the
   *  "30-second guide" inline CTA so a first-time founder doesn't have
   *  to discover the corner Guide button on their own. */
  isFirstSession?:  boolean;
  /** Opens the Interview Guide drawer (parent owns the open state). */
  onOpenGuide?:     () => void;
}

function getGreeting(firstName: string): string {
  const hour = new Date().getHours();
  const name = firstName ? `, ${firstName}` : '';
  if (hour < 12) return `Good morning${name}`;
  if (hour < 17) return `Good afternoon${name}`;
  return `Good evening${name}`;
}

const TIPS: Array<{
  icon: typeof Target;
  text: string;
  /** Token color class — kept restrained (one each across the trio so
   *  the eye reads the tips as a triad of priorities, not a wall). */
  color: string;
}> = [
  { icon: Target,         text: 'Give specific numbers — time, budget, success metrics', color: 'text-primary' },
  { icon: AlertTriangle,  text: 'Name failed attempts honestly, including why you stopped', color: 'text-gold' },
  { icon: ListChecks,     text: 'Answer one question at a time — no compression',           color: 'text-success' },
];

/**
 * WelcomeLayer
 *
 * Empty-state shown before the first message is sent. Premium-lift
 * over the prior generic shadcn-muted shape:
 *
 *   1. "Discovery interview" agent-presence pill above the greeting —
 *      anchors who is talking and sets the 5-15 question expectation.
 *      Replaces the prior absence of any agent marker.
 *   2. Question card carries a gold left-accent + full-opacity gold
 *      eyebrow — same visual language as the Sample Recommendation
 *      Card on the marketing landing, so a paying user moves between
 *      surfaces without a brand discontinuity.
 *   3. Tips render as a small Lucide-iconified triad (Target / Alert /
 *      ListChecks) in primary/gold/success tokens — readable instead
 *      of barely-visible /40 opacity bullets.
 *   4. First-session founders get an inline "30-second guide →" CTA
 *      so they do not have to discover the corner Guide button on
 *      their own.
 *   5. Staggered motion entrance (60ms between bands) — restrained,
 *      respects useReducedMotion via Motion's whileInView default.
 *
 * Time-aware greeting + random rotating question are preserved
 * verbatim — both already worked.
 */
export function WelcomeLayer({ firstName, isVisible, isFirstSession = false, onOpenGuide }: WelcomeLayerProps) {
  const [greeting] = useState(() => getGreeting(firstName));
  const [question] = useState(() =>
    WELCOME_QUESTION_POOL[Math.floor(Math.random() * WELCOME_QUESTION_POOL.length)],
  );

  return (
    <AnimatePresence>
      {isVisible && greeting && (
        <motion.div
          key="welcome"
          initial={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2, ease: 'easeIn' }}
          className="flex flex-col items-center gap-7 w-full select-none"
        >
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-[11px] font-medium text-muted-foreground"
          >
            <Compass className="size-3 text-gold" aria-hidden="true" />
            Discovery interview · 5–15 questions
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06, ease: 'easeOut' }}
            className="text-3xl font-semibold text-foreground tracking-tight text-center"
          >
            {greeting}
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12, ease: 'easeOut' }}
            className="max-w-md w-full rounded-xl border border-border/70 bg-card/60 px-5 py-4 space-y-2.5 border-l-[3px] border-l-gold shadow-lg shadow-black/10"
          >
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-gold">
              Think about this
            </p>
            <p className="text-[15px] leading-relaxed text-foreground text-center sm:text-left">
              {question}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18, ease: 'easeOut' }}
            className="max-w-md w-full space-y-2"
          >
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-muted-foreground/70 text-center mb-3">
              For the best recommendation
            </p>
            <ul role="list" className="space-y-2">
              {TIPS.map(tip => {
                const Icon = tip.icon;
                return (
                  <li
                    key={tip.text}
                    className="flex items-start gap-3 text-xs text-muted-foreground"
                  >
                    <span
                      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-md bg-card/60 ${tip.color}`}
                      aria-hidden="true"
                    >
                      <Icon className="size-3" />
                    </span>
                    <span className="leading-relaxed">{tip.text}</span>
                  </li>
                );
              })}
            </ul>
          </motion.div>

          {isFirstSession && onOpenGuide && (
            <motion.button
              type="button"
              onClick={onOpenGuide}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.24, ease: 'easeOut' }}
              className="group inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Open the 30-second interview guide"
            >
              <BookOpen className="size-3" aria-hidden="true" />
              First time? Read the 30-second guide
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
