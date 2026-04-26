"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import type { ComponentType, SVGProps } from "react";

const SPRING: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
};

const STAGGER_S = 0.06;

type Accent = "blue" | "gold";

const ACCENT_CLASSES: Record<Accent, string> = {
  blue: "bg-primary/10 ring-primary/30 text-primary",
  gold: "bg-gold/10 ring-gold/30 text-gold",
};

export type ToolCardProps = {
  index: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  tagline: string;
  body: string;
  accent: Accent;
  visual: ComponentType;
  className?: string;
};

export default function ToolCard({
  index,
  icon: Icon,
  name,
  tagline,
  body,
  accent,
  visual: Visual,
  className = "",
}: ToolCardProps) {
  const reduce = useReducedMotion();

  const motionProps = reduce
    ? { initial: false as const, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-10%" },
        transition: { ...SPRING, delay: index * STAGGER_S },
      };

  return (
    <motion.article
      {...motionProps}
      className={`flex h-full flex-col rounded-xl border border-slate-800 bg-navy-900 p-6 shadow-xl shadow-navy-950/50 transition-colors hover:border-slate-700 ${className}`}
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ring-inset ${ACCENT_CLASSES[accent]}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">{name}</h3>
      <p className="mt-1 text-sm text-gold">{tagline}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{body}</p>
      <div className="mt-5">
        <Visual />
      </div>
    </motion.article>
  );
}
