// Pushback round counts (10 / 15 / soft-warn at 4) are a static mirror
// of PUSHBACK_CONFIG in packages/constants/src/discovery.ts. Verdict
// labels mirror PUSHBACK_ACTIONS in client/src/lib/discovery/pushback-engine.ts.
// If those constants change, update the visual here as well.

import type { Transition } from "motion/react";

export const SPRING: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
};

export const STAGGER_S = 0.06;

export type Tone = "success" | "gold" | "slate" | "primary";

export const RING: Record<Tone, string> = {
  success: "bg-success/10 ring-success/30 text-success",
  gold: "bg-gold/10 ring-gold/30 text-gold",
  slate: "bg-slate-800 ring-slate-700 text-slate-300",
  primary: "bg-primary/10 ring-primary/30 text-primary",
};

export const DOT_TONE: Record<Tone, string> = {
  success: "bg-success",
  gold: "bg-gold",
  slate: "bg-slate-600",
  primary: "bg-primary",
};
