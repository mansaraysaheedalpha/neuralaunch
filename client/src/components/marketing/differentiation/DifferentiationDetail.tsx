"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import type { HTMLAttributes } from "react";
import type { Competitor } from "./data";
import { DETAIL_PANEL_ID } from "./track-shared";

export type DifferentiationDetailProps = {
  competitor: Competitor;
  reducedMotion: boolean;
  hoverHandlers: Pick<
    HTMLAttributes<HTMLDivElement>,
    "onMouseEnter" | "onMouseLeave" | "onFocusCapture" | "onBlurCapture"
  >;
};

export function DifferentiationDetail({
  competitor,
  reducedMotion,
  hoverHandlers,
}: DifferentiationDetailProps) {
  return (
    <div
      id={DETAIL_PANEL_ID}
      role="tabpanel"
      aria-labelledby={`differentiation-tab-${competitor.id}`}
      {...hoverHandlers}
      className="relative mx-auto mt-12 max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-navy-800 to-navy-900 p-5 shadow-xl shadow-navy-950/40 sm:p-7 lg:min-h-[260px] lg:p-9"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={competitor.id}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
          }
          className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12"
        >
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {competitor.name.toUpperCase()} &middot; STOPS HERE
            </p>
            <p className="text-base leading-relaxed text-slate-300 line-through decoration-slate-700 decoration-1 underline-offset-4 lg:text-lg">
              {competitor.stopsAt}
            </p>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              NEURALAUNCH
            </p>
            <p className="text-base leading-relaxed text-slate-200 lg:text-lg">
              {competitor.neuralaunchAnswer}
            </p>
            <ul className="mt-5 flex flex-wrap gap-1.5">
              {competitor.unlocks.map((unlock) => (
                <li
                  key={unlock}
                  className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/5 px-2.5 py-0.5 text-[10px] font-medium text-success"
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  {unlock}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
