"use client";

import { motion, useReducedMotion } from "motion/react";
import { HorizontalStrip } from "./HorizontalStrip";
import { VerticalStrip } from "./VerticalStrip";
import {
  DOT_TONE,
  SPRING,
  STAGGER_S,
  type ChipMotionFn,
  type EventTone,
} from "./strip-shared";

export function VentureLifecycleStrip() {
  const reduce = useReducedMotion();

  const containerMotion = reduce
    ? { initial: false as const, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-15%" },
        transition: SPRING,
      };

  const chipMotion: ChipMotionFn = (i: number) =>
    reduce
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 8 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-15%" },
          transition: { ...SPRING, delay: 0.15 + i * STAGGER_S },
        };

  return (
    <motion.div
      {...containerMotion}
      role="presentation"
      aria-hidden="true"
      className="rounded-2xl border border-slate-800 bg-gradient-to-br from-navy-900 to-navy-950 p-6 lg:p-8"
    >
      <Header />

      <div className="mt-6 hidden md:block">
        <HorizontalStrip chipMotion={chipMotion} />
      </div>

      <div className="mt-6 md:hidden">
        <VerticalStrip chipMotion={chipMotion} />
      </div>

      <p className="mt-6 text-center text-xs italic text-slate-400">
        Every event held in context. Every later decision draws on every
        earlier one.
      </p>
    </motion.div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        An 8-week venture
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Legend tone="primary" label="Check-in" />
        <Legend tone="gold" label="Nudge" />
        <Legend tone="success" label="Memory" />
        <Legend tone="gold" label="Recalibration" />
      </div>
    </div>
  );
}

function Legend({ tone, label }: { tone: EventTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_TONE[tone]}`} />
      {label}
    </span>
  );
}
