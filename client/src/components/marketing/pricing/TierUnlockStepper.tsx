"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";

const SPRING: Transition = {
  type:      "spring",
  stiffness: 240,
  damping:   28,
};

const PILL_STAGGER_S = 0.08;

interface PillSpec {
  name:    string;
  caption: string;
  /** Tailwind classes for the pill chrome. */
  chrome:  string;
  /** Tailwind classes for the leading dot. */
  dot:     string;
  /** Tailwind classes for the caption text. */
  caption_class: string;
}

const PILLS: PillSpec[] = [
  {
    name:          "Free",
    caption:       "discovery",
    // Solid navy-950 fully occludes the gradient line behind the pill.
    // Earlier the gold/5 and success/5 tints on Execute/Compound let
    // the gradient bleed through and read as strikethrough — fixed by
    // grounding all three pills on the same opaque base. Tier colour
    // is still carried by the border, dot, and caption.
    chrome:        "border-slate-700 text-slate-300 bg-navy-950",
    dot:           "bg-primary",
    caption_class: "text-slate-500",
  },
  {
    name:          "Execute",
    caption:       "+ execution",
    chrome:        "border-gold/40 text-gold bg-navy-950",
    dot:           "bg-gold",
    caption_class: "text-gold/70",
  },
  {
    name:          "Compound",
    caption:       "+ scale",
    chrome:        "border-success/40 text-success bg-navy-950",
    dot:           "bg-success",
    caption_class: "text-success/70",
  },
];

/**
 * Tier-unlock stepper — three pills threaded by a primary→gold→success
 * gradient line, visualising the "each tier unlocks the next layer"
 * headline so the unlock arc is felt before it is read.
 *
 * Decorative — wrapped in role="presentation" + aria-hidden. The cards
 * below carry the real semantic meaning (each card has its own h3).
 */
export default function TierUnlockStepper() {
  const reduce = useReducedMotion();

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="relative mx-auto w-full max-w-3xl"
    >
      {/* Below md: stack the pills vertically — three rounded-full pills
          with px-5 padding and full captions don't fit on a 320-375px
          viewport in horizontal flex justify-between, which used to push
          the entire page wider than the viewport and caused horizontal
          scroll. md+ keeps the original horizontal connected-ladder. */}
      <div className="relative flex flex-col items-center gap-2.5 md:flex-row md:justify-between md:gap-0">
        {/* Gradient line — md+ only. Draws in left-to-right on viewport-
            enter so the eye registers the arc before the pills land. */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-1/2 -z-0 hidden h-px -translate-y-1/2 origin-left bg-gradient-to-r from-primary via-gold to-success md:block"
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={reduce ? undefined : { scaleX: 1 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={reduce ? undefined : { ...SPRING, duration: 0.7 }}
        />

        {PILLS.map((pill, i) => (
          <motion.div
            key={pill.name}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={reduce ? undefined : { ...SPRING, delay: 0.35 + i * PILL_STAGGER_S }}
            className={`relative z-10 inline-flex items-center gap-2 rounded-full border px-4 py-2 md:px-5 md:py-2.5 ${pill.chrome}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
            <span className="text-sm font-semibold">{pill.name}</span>
            <span className={`text-xs ${pill.caption_class}`}>{pill.caption}</span>
          </motion.div>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Each tier inherits everything from the tier below.
      </p>
    </div>
  );
}
