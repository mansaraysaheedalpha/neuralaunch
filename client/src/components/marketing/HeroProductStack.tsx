"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { AlertTriangle, Check, X } from "lucide-react";

const STAGGER_S = 0.06;

const CARD_BASE =
  "rounded-xl border border-slate-800 bg-navy-900 p-5 shadow-xl shadow-navy-950/50";

const SPRING: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
};

type CardMotionProps = {
  initial: false | { opacity: number; y: number; scale: number };
  animate: { opacity: number; y: number; scale: number };
  transition?: Transition;
};

function buildCardMotion(index: number, reduce: boolean | null): CardMotionProps {
  if (reduce) {
    return {
      initial: false,
      animate: { opacity: 1, y: 0, scale: 1 },
    };
  }
  return {
    initial: { opacity: 0, y: 16, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { ...SPRING, delay: index * STAGGER_S },
  };
}

export default function HeroProductStack() {
  const reduce = useReducedMotion();

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[520px]"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-50 [background-image:linear-gradient(to_right,rgba(30,41,59,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,41,59,0.6)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_85%)]"
      />
      <div className="pointer-events-none absolute inset-x-0 top-[70%] -z-10 h-px bg-gold/30" />

      <div className="relative">
        <motion.div
          {...buildCardMotion(0, reduce)}
          className={`absolute left-[-48px] top-[-32px] z-10 hidden w-[80%] -rotate-[8deg] opacity-90 md:block ${CARD_BASE}`}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Discovery &middot; Question 7 of 11
          </p>
          <div className="mt-4 rounded-lg border border-slate-800 bg-navy-800/60 p-4">
            <p className="text-sm leading-relaxed text-slate-200">
              When you say &ldquo;stuck&rdquo;, is it the next step that&rsquo;s
              unclear &mdash; or do you not trust the direction itself?
            </p>
          </div>
          <div className="mt-3 flex items-center gap-1.5 px-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-600" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-600 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-600 [animation-delay:300ms]" />
          </div>
        </motion.div>

        <motion.div
          {...buildCardMotion(1, reduce)}
          className={`relative z-20 border-l-[3px] border-l-gold ${CARD_BASE}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Your recommendation
          </p>
          <h3 className="mt-3 text-lg font-semibold text-white">
            Pivot to validated services before code.
          </h3>
          <div className="mt-4 space-y-2">
            <div className="flex items-start gap-2.5 rounded-md border border-success/20 bg-success/10 px-3 py-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p className="text-sm leading-snug text-slate-200">
                <span className="font-medium text-white">Reasoning:</span>{" "}
                Faster cash, lower risk than 6-month build.
              </p>
            </div>
            <div className="flex items-start gap-2.5 rounded-md border border-gold/20 bg-gold/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <p className="text-sm leading-snug text-slate-200">
                <span className="font-medium text-white">
                  What would make this wrong:
                </span>{" "}
                Service margin under 40%.
              </p>
            </div>
            <div className="flex items-start gap-2.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p className="text-sm leading-snug text-slate-300">
                <span className="font-medium text-slate-200">
                  Alternative rejected:
                </span>{" "}
                Build MVP first.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          {...buildCardMotion(2, reduce)}
          className={`absolute bottom-[-32px] right-[-48px] z-10 hidden w-[80%] rotate-[6deg] opacity-95 md:block ${CARD_BASE}`}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Roadmap &middot; Phase 1 of 3
          </p>
          <ul className="mt-4 space-y-3">
            <li className="flex items-center gap-3">
              <span className="h-4 w-4 shrink-0 rounded-full border border-slate-700" />
              <span className="flex-1 text-sm text-slate-200">
                Map five suppliers in your market
              </span>
              <TimeChip>2h</TimeChip>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
                <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
              </span>
              <span className="flex-1 text-sm text-slate-200">
                Draft service tier sheet
              </span>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <TimeChip>4h</TimeChip>
            </li>
            <li className="flex items-center gap-3">
              <span className="h-4 w-4 shrink-0 rounded-full border border-slate-700" />
              <span className="flex-1 text-sm text-slate-200">
                Send first 5 outreach messages
              </span>
              <TimeChip>1 evening</TimeChip>
            </li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
}

function TimeChip({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-slate-700 bg-navy-800 px-2 py-0.5 text-[10px] text-slate-400">
      {children}
    </span>
  );
}
