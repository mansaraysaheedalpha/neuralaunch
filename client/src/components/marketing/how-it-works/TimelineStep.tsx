"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import {
  NODE_RING,
  SPRING,
  STEP_STAGGER_S,
  type StepColor,
} from "./shared";

const ICON_TONE_CLASS: Record<StepColor, string> = {
  primary: "text-primary",
  "primary-to-gold": "text-primary",
  gold: "text-gold",
  "gold-to-success": "text-gold",
  success: "text-success",
};

export type TimelineStepProps = {
  index: number;
  number: number;
  side: "left" | "right";
  color: StepColor;
  /** Pre-rendered lucide icon node. Pass JSX (e.g. <MessageSquare className="h-4 w-4" />)
   *  rather than a component type — function components do not cross the
   *  Server→Client Component boundary, so the parent Server Component
   *  must render the icon JSX itself. */
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  /** Pre-rendered mock node. Same boundary reason as `icon`. */
  visual: ReactNode;
};

export default function TimelineStep({
  index,
  number,
  side,
  color,
  icon,
  eyebrow,
  title,
  body,
  visual,
}: TimelineStepProps) {
  const reduce = useReducedMotion();

  const contentMotion = reduce
    ? { initial: false as const, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-15%" },
        transition: { ...SPRING, delay: index * STEP_STAGGER_S },
      };

  const nodeMotion = reduce
    ? { initial: false as const, animate: { opacity: 1, scale: 1 } }
    : {
        initial: { opacity: 0, scale: 0.8 },
        whileInView: { opacity: 1, scale: 1 },
        viewport: { once: true, margin: "-15%" },
        transition: { ...SPRING, delay: index * STEP_STAGGER_S + 0.05 },
      };

  // lg+ uses alternating sides; below lg, all steps render to the right of a
  // left-anchored spine.
  const lgSideClass =
    side === "right"
      ? "lg:col-start-7 lg:pl-12 lg:text-left"
      : "lg:col-start-1 lg:pr-12 lg:text-right lg:items-end";

  return (
    <li className="relative grid grid-cols-1 lg:grid-cols-12">
      <motion.span
        {...nodeMotion}
        aria-hidden="true"
        className={`absolute left-4 top-0 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-navy-950 ring-2 ring-inset md:left-6 lg:left-1/2 ${NODE_RING[color]}`}
      >
        <span className="text-sm font-semibold tabular-nums">{number}</span>
      </motion.span>

      <motion.div
        {...contentMotion}
        className={`flex flex-col pl-12 md:pl-16 lg:col-span-6 lg:pl-0 ${lgSideClass}`}
      >
        <div
          className={`flex items-center gap-2 ${
            side === "left" ? "lg:flex-row-reverse" : ""
          }`}
        >
          <span aria-hidden="true" className={ICON_TONE_CLASS[color]}>
            {icon}
          </span>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {eyebrow}
          </p>
        </div>
        <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">
          {title}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300 sm:text-base">
          {body}
        </p>
        <div className="mt-6 w-full max-w-md">{visual}</div>
      </motion.div>
    </li>
  );
}
