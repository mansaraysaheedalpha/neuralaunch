"use client";

import {
  motion,
  useInView,
  useReducedMotion,
  type Transition,
} from "motion/react";
import { AlertTriangle, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

/** Scripted micro-sequence phases. Each phase highlights one card so the
 *  hero communicates "the system progresses through stages" without
 *  duplicating the HowItWorks narrative below. Plays once on viewport-enter. */
type Phase = "idle" | "discovery" | "recommendation" | "roadmap" | "done";

const PHASE_TIMINGS: Array<{ at: Phase; delayMs: number }> = [
  { at: "discovery", delayMs: 700 },
  { at: "recommendation", delayMs: 2000 },
  { at: "roadmap", delayMs: 3500 },
  { at: "done", delayMs: 4800 },
];

export default function HeroProductStack() {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-15%" });
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (reduce) return;
    if (!inView) return;
    const timers = PHASE_TIMINGS.map(({ at, delayMs }) =>
      window.setTimeout(() => setPhase(at), delayMs),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [inView, reduce]);

  // Under reduce-motion, render the final state directly without
  // running the timer-driven sequence. The `phase` state stays "idle"
  // and the reach-flags short-circuit on `reduce`.
  const reachedDiscovery =
    !!reduce ||
    phase === "discovery" ||
    phase === "recommendation" ||
    phase === "roadmap" ||
    phase === "done";
  const reachedRecommendation =
    !!reduce ||
    phase === "recommendation" ||
    phase === "roadmap" ||
    phase === "done";
  const reachedRoadmap =
    !!reduce || phase === "roadmap" || phase === "done";

  return (
    <div
      ref={containerRef}
      role="presentation"
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[520px]"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-50 [background-image:linear-gradient(to_right,rgba(30,41,59,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,41,59,0.6)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_85%)]"
      />
      <div className="pointer-events-none absolute inset-x-0 top-[70%] -z-10 h-px bg-gold/30" />

      <div className="relative">
        {/* Card 1 — Discovery (back, top-left) */}
        <motion.div
          {...buildCardMotion(0, reduce)}
          className={`absolute left-[-72px] top-[-72px] z-10 hidden w-[78%] -rotate-[7deg] opacity-95 md:block ${CARD_BASE}`}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Discovery &middot; Question 7 of 11
          </p>
          <motion.div
            animate={{
              borderColor: reachedDiscovery
                ? "rgb(37 99 235 / 0.4)"
                : "rgb(30 41 59)",
              boxShadow: reachedDiscovery
                ? "0 0 0 1px rgb(37 99 235 / 0.25)"
                : "0 0 0 0 rgb(37 99 235 / 0)",
            }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 rounded-lg border bg-navy-800/60 p-4"
          >
            <p className="text-sm leading-relaxed text-slate-200">
              When you say &ldquo;stuck&rdquo;, is it the next step that&rsquo;s
              unclear &mdash; or do you not trust the direction itself?
            </p>
          </motion.div>
          <div className="mt-3 flex items-center gap-1.5 px-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-600" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-600 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-600 [animation-delay:300ms]" />
          </div>
        </motion.div>

        {/* Card 2 — Recommendation (focal) */}
        <motion.div
          {...buildCardMotion(1, reduce)}
          className={`relative z-20 border-l-[3px] border-l-gold ${CARD_BASE}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Your recommendation
          </p>
          <div className="relative mt-3 inline-block">
            <h3 className="text-lg font-semibold text-white">
              Pivot to validated services before code.
            </h3>
            <motion.span
              aria-hidden="true"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: reachedRecommendation ? 1 : 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: "left center" }}
              className="absolute -bottom-0.5 left-0 h-px w-full bg-gradient-to-r from-gold to-transparent"
            />
          </div>
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

        {/* Card 3 — Roadmap (front, bottom-right) */}
        <motion.div
          {...buildCardMotion(2, reduce)}
          className={`absolute bottom-[-72px] right-[-72px] z-10 hidden w-[78%] rotate-[5deg] opacity-95 md:block ${CARD_BASE}`}
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
              <Checkbox done={reachedRoadmap} />
              <span className="flex-1 text-sm text-slate-200">
                Draft service tier sheet
              </span>
              {reachedRoadmap && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              )}
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

function Checkbox({ done }: { done: boolean }) {
  return (
    <motion.span
      animate={{
        backgroundColor: done ? "rgb(37 99 235)" : "rgb(10 22 40)",
        borderColor: done ? "rgb(37 99 235)" : "rgb(51 65 85)",
      }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
    >
      {done && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, ...SPRING }}
        >
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </motion.span>
      )}
    </motion.span>
  );
}

function TimeChip({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-slate-700 bg-navy-800 px-2 py-0.5 text-[10px] text-slate-400">
      {children}
    </span>
  );
}
