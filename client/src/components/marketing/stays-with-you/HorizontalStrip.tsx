"use client";

import { motion } from "motion/react";
import {
  BASELINE_OFFSET,
  CHIP_TONE,
  CONNECTOR_TONE,
  EVENTS,
  STRIP_HEIGHT,
  WEEKS,
  leftPercent,
  type ChipMotionFn,
  type LifecycleEvent,
} from "./strip-shared";

export function HorizontalStrip({
  chipMotion,
}: {
  chipMotion: ChipMotionFn;
}) {
  return (
    <div className="relative w-full" style={{ height: `${STRIP_HEIGHT}px` }}>
      <div
        className="absolute inset-x-0 h-px bg-slate-800"
        style={{ bottom: `${BASELINE_OFFSET}px` }}
      />
      {WEEKS.map((w) => (
        <WeekTick key={w} week={w} />
      ))}
      {EVENTS.map((event, i) => (
        <motion.div
          key={`${event.week}-${event.label}`}
          {...chipMotion(i)}
          className="absolute"
          style={{
            left: `${leftPercent(event.week)}%`,
            bottom: `${BASELINE_OFFSET}px`,
            height: `${event.lift}px`,
            transform: "translateX(-50%)",
          }}
        >
          <div
            className={`absolute bottom-0 left-1/2 w-px -translate-x-1/2 ${CONNECTOR_TONE[event.tone]}`}
            style={{ height: `${event.lift - 4}px` }}
          />
          <Chip event={event} />
        </motion.div>
      ))}
    </div>
  );
}

function WeekTick({ week }: { week: number }) {
  const isEdge = week === 1 || week === WEEKS.length;
  const labelText =
    week === 1 ? "Start" : week === WEEKS.length ? "Mark complete" : `W${week}`;
  return (
    <div
      className="absolute"
      style={{
        left: `${leftPercent(week)}%`,
        bottom: `${BASELINE_OFFSET - 6}px`,
        transform: "translateX(-50%)",
      }}
    >
      <span className="block h-3 w-px bg-slate-700" />
      <span
        className={`mt-1 block whitespace-nowrap text-center text-[10px] ${
          isEdge ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {labelText}
      </span>
    </div>
  );
}

function Chip({ event }: { event: LifecycleEvent }) {
  const Icon = event.icon;
  return (
    <span
      className={`absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium ${CHIP_TONE[event.tone]}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {event.label}
    </span>
  );
}
