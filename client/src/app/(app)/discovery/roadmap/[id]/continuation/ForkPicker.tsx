'use client';
// src/app/(app)/discovery/roadmap/[id]/continuation/ForkPicker.tsx

import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { DURATION, EASE } from '@/lib/motion-tokens';
import type { ContinuationFork } from '@/lib/continuation';

export interface ForkPickerProps {
  forks:    ContinuationFork[];
  onPick:   (fork: ContinuationFork) => void;
  picking:  string | null;
  error:    string | null;
  isPicked: boolean;
}

/**
 * ForkPicker — section 4 of the continuation brief. The emotional
 * crescendo of the continuation flow. Renders each fork as a
 * full-width card with gold accents and motion. Once the founder
 * picks a fork, unselected forks fade out and the selected fork
 * scales up with a brief success treatment before navigation fires.
 */
export function ForkPicker({ forks, onPick, picking, error, isPicked }: ForkPickerProps) {
  if (isPicked) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DURATION.slow, ease: EASE.emphasis }}
        className="rounded-xl border border-success/30 bg-success/5 px-6 py-5 flex flex-col gap-2"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-success flex items-center gap-1">
          <Check className="size-3" />
          Fork selected — building your next roadmap
        </p>
        <p className="text-sm text-foreground leading-relaxed">
          Your next roadmap will be generated from the fork you picked. Open it from your discovery hub when it&apos;s ready.
        </p>
      </motion.div>
    );
  }

  const hasPicked = picking !== null;

  return (
    <section className="flex flex-col gap-4 -mx-2">
      {/* Gold overline to frame the decision moment */}
      <div className="px-2">
        <p className="text-caption text-gold font-semibold uppercase tracking-widest">
          The decision
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80 mt-1">
          4. The fork — pick one
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {forks.map((fork, i) => {
            const isPicking = picking === fork.id;
            const isOtherPicking = hasPicked && picking !== fork.id;
            return (
              <motion.div
                key={fork.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{
                  opacity: isOtherPicking ? 0.5 : 1,
                  y: 0,
                  scale: isPicking ? 1.02 : 1,
                }}
                exit={{ opacity: 0, height: 0 }}
                transition={{
                  delay: hasPicked ? 0 : i * 0.05,
                  duration: DURATION.slow,
                  ease: isPicking ? EASE.emphasis : EASE.standard,
                }}
                className={[
                  'rounded-xl border px-6 py-5 flex flex-col gap-2 transition-colors',
                  isPicking
                    ? 'border-gold ring-2 ring-gold/20 bg-gold/5'
                    : 'border-border bg-card hover:border-gold/30',
                ].join(' ')}
              >
                <p className="text-lg font-semibold text-foreground">{fork.title}</p>
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
                  className="self-start mt-2 inline-flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity duration-fast"
                >
                  {isPicking && <Loader2 className="size-3.5 animate-spin" />}
                  {!isPicking && <ArrowRight className="size-3.5" />}
                  Pick this fork
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
