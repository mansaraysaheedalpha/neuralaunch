"use client";

import { AnimatePresence, motion } from "motion/react";
import type { HTMLAttributes } from "react";
import type { Archetype } from "./data";
import { SPOTLIGHT_PANEL_ID } from "./ArchetypeSelector";

export type ProblemSpotlightProps = {
  archetype: Archetype;
  index: number;
  total: number;
  reducedMotion: boolean;
  hoverHandlers: Pick<
    HTMLAttributes<HTMLDivElement>,
    "onMouseEnter" | "onMouseLeave" | "onFocusCapture" | "onBlurCapture"
  >;
};

export function ProblemSpotlight({
  archetype,
  index,
  total,
  reducedMotion,
  hoverHandlers,
}: ProblemSpotlightProps) {
  return (
    <div
      id={SPOTLIGHT_PANEL_ID}
      role="tabpanel"
      aria-labelledby={`archetype-tab-${archetype.id}`}
      {...hoverHandlers}
      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-navy-800 to-navy-900 p-7 shadow-xl shadow-navy-950/40 lg:min-h-[480px] lg:p-9"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={archetype.id}
          initial={
            reducedMotion ? false : { opacity: 0, y: 8 }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
          }
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white lg:text-3xl">
            {archetype.role}
          </h3>

          <blockquote className="mt-6 border-l-2 border-l-gold py-1 pl-5">
            <p className="text-base italic leading-relaxed text-slate-200 lg:text-lg">
              &ldquo;{archetype.monologue}&rdquo;
            </p>
          </blockquote>

          <p className="mt-6 max-w-prose text-sm leading-relaxed text-slate-300">
            {archetype.situation}
          </p>

          <div
            aria-hidden="true"
            className="relative mt-7 flex items-center"
          >
            <span className="h-px w-full bg-slate-800" />
            <span className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gold" />
          </div>

          <div className="mt-7 rounded-lg border border-gold/30 bg-gold/5 p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold">
              After the interview
            </p>
            <p className="text-sm leading-relaxed text-slate-200 lg:text-base">
              {archetype.shift}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
