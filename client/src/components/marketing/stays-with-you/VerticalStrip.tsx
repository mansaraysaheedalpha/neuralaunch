"use client";

import { motion } from "motion/react";
import {
  CHIP_TONE,
  EVENTS,
  type ChipMotionFn,
} from "./strip-shared";

export function VerticalStrip({
  chipMotion,
}: {
  chipMotion: ChipMotionFn;
}) {
  return (
    <div className="relative pl-6">
      <div className="absolute bottom-1 left-2 top-1 w-px bg-slate-800" />
      <ol className="flex flex-col gap-2.5">
        {EVENTS.map((event, i) => {
          const Icon = event.icon;
          return (
            <motion.li
              key={`${event.week}-${event.label}`}
              {...chipMotion(i)}
              className="relative flex items-center gap-2.5"
            >
              <span className="absolute -left-[18px] h-px w-2.5 bg-slate-700" />
              <span className="w-7 shrink-0 text-[10px] tabular-nums text-slate-500">
                W{event.week}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${CHIP_TONE[event.tone]}`}
              >
                <Icon className="h-3 w-3" strokeWidth={2.5} />
                <span className="truncate">{event.label}</span>
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
