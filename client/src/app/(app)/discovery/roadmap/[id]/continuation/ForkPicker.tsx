'use client';
// src/app/(app)/discovery/roadmap/[id]/continuation/ForkPicker.tsx

import { motion } from 'motion/react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import type { ContinuationFork } from '@/lib/continuation';

export interface ForkPickerProps {
  forks:    ContinuationFork[];
  onPick:   (fork: ContinuationFork) => void;
  picking:  string | null;
  error:    string | null;
  isPicked: boolean;
}

/**
 * ForkPicker — section 4 of the continuation brief. Renders each
 * fork as a card with title, rationale, first step, time estimate,
 * "right if" condition, and a pick button. Once the founder picks
 * a fork, the parent flips to FORK_SELECTED state and this picker
 * shows a terminal "selected" view.
 *
 * Phase 6 will add an automatic redirect to the next-cycle roadmap
 * once the new Roadmap row is generated; today the picker just
 * persists the choice.
 */
export function ForkPicker({ forks, onPick, picking, error, isPicked }: ForkPickerProps) {
  if (isPicked) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-green-500/30 bg-green-500/5 px-5 py-4 flex flex-col gap-2"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-green-700 dark:text-green-400 flex items-center gap-1">
          <Check className="size-3" />
          Fork selected
        </p>
        <p className="text-sm text-foreground leading-relaxed">
          Your next roadmap will be generated from the fork you picked. Open it from your discovery hub when it&apos;s ready.
        </p>
      </motion.div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
        4. The fork — pick one
      </p>
      <div className="flex flex-col gap-3">
        {forks.map((fork, i) => {
          const isPicking = picking === fork.id;
          const isOtherPicking = picking !== null && picking !== fork.id;
          return (
            <motion.div
              key={fork.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card px-5 py-4 flex flex-col gap-2"
            >
              <p className="text-base font-semibold text-foreground">{fork.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{fork.rationale}</p>
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="text-[11px] text-foreground/85">
                  <span className="font-semibold">First step:</span> {fork.firstStep}
                </div>
                <div className="text-[11px] text-foreground/85">
                  <span className="font-semibold">Time:</span> {fork.timeEstimate}
                </div>
                <div className="text-[11px] text-foreground/70 italic">
                  {fork.rightIfCondition}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onPick(fork)}
                disabled={isPicking || isOtherPicking}
                className="self-start mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isPicking && <Loader2 className="size-3.5 animate-spin" />}
                {!isPicking && <ArrowRight className="size-3.5" />}
                Pick this fork
              </button>
            </motion.div>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </section>
  );
}
