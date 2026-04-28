// Lifecycle event timing reflects real triggers:
// - Recalibration at W5 mirrors RECALIBRATION_MIN_COVERAGE = 0.4
//   (packages/constants/src/checkin.ts) — must surface only after
//   ≥40% execution coverage.
// - Nudge at W2 reflects roadmap-nudge-function.ts: fires at
//   timeEstimate × 1.5 with a 3-day floor and 7-day cooldown.
// - Continuation brief at W8 mirrors brief-schema.ts (5 sections).

import type { Transition } from "motion/react";
import {
  Bell,
  Brain,
  Compass,
  MessageSquare,
  RefreshCcw,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export const SPRING: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 28,
};

export const STAGGER_S = 0.08;

export type EventTone = "primary" | "gold" | "success";

export type LifecycleEvent = {
  week: number;
  tone: EventTone;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  /** Vertical lift in px on the horizontal strip — used to avoid chip
   *  collisions and create visual rhythm. */
  lift: number;
};

export const EVENTS: LifecycleEvent[] = [
  { week: 1, tone: "primary", icon: MessageSquare, label: "Check-in: first task complete", lift: 96 },
  { week: 2, tone: "gold", icon: Bell, label: "Nudge: task overdue 2 days", lift: 56 },
  { week: 3, tone: "primary", icon: MessageSquare, label: "Check-in: blocker resolved", lift: 112 },
  { week: 4, tone: "success", icon: Brain, label: "Memory: parking-lot item captured", lift: 64 },
  { week: 5, tone: "gold", icon: RefreshCcw, label: "Recalibration offered (40% coverage)", lift: 104 },
  { week: 7, tone: "primary", icon: MessageSquare, label: "Check-in: feature validated", lift: 56 },
  { week: 8, tone: "success", icon: Compass, label: "Continuation brief", lift: 96 },
];

export const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8];

export const STRIP_HEIGHT = 180;
export const BASELINE_OFFSET = 28;

export const CHIP_TONE: Record<EventTone, string> = {
  primary: "border-primary/40 bg-primary/10 text-primary",
  gold: "border-gold/40 bg-gold/10 text-gold",
  success: "border-success/40 bg-success/10 text-success",
};

export const CONNECTOR_TONE: Record<EventTone, string> = {
  primary: "bg-primary/40",
  gold: "bg-gold/40",
  success: "bg-success/40",
};

export const DOT_TONE: Record<EventTone, string> = {
  primary: "bg-primary",
  gold: "bg-gold",
  success: "bg-success",
};

export function leftPercent(week: number) {
  return ((week - 1) / (WEEKS.length - 1)) * 100;
}

export type ChipMotionFn = (i: number) => Record<string, unknown>;
