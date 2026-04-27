import type { Transition } from "motion/react";

export const SPRING: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
};

export const STEP_STAGGER_S = 0.08;

export type StepColor =
  | "primary"
  | "primary-to-gold"
  | "gold"
  | "gold-to-success"
  | "success";

export const NODE_RING: Record<StepColor, string> = {
  primary: "ring-primary text-primary",
  "primary-to-gold": "ring-primary text-primary",
  gold: "ring-gold text-gold",
  "gold-to-success": "ring-gold text-gold",
  success: "ring-success text-success",
};
