"use client";

import { motion } from "motion/react";
import type { KeyboardEvent } from "react";
import { COMPETITORS, JOURNEY_PHASES, type Competitor } from "./data";
import { DETAIL_PANEL_ID, type TrackVariantProps } from "./track-shared";

export function HorizontalTrack({
  activeIndex,
  onSelect,
  handleKey,
  registerTab,
  lineMotion,
  pinMotion,
}: TrackVariantProps) {
  return (
    <div className="relative h-[280px] w-full lg:h-[320px]">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-[60px] grid grid-cols-5 gap-1"
      >
        {JOURNEY_PHASES.map((phase) => (
          <div key={phase} className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {phase}
            </span>
            <span className="h-1.5 rounded-full bg-slate-800" />
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 top-[140px] flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">
          LOST
        </span>
        <span className="text-xs uppercase tracking-wider text-success">
          LAUNCHED
        </span>
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-12 top-[160px] h-px bg-slate-800"
      />

      <motion.div
        aria-hidden="true"
        {...lineMotion}
        style={{ transformOrigin: "left center" }}
        className="absolute inset-x-12 top-[176px] h-0.5 rounded-full bg-gradient-to-r from-primary via-gold to-success"
      />
      <span
        aria-hidden="true"
        className="absolute right-0 top-[170px] inline-flex items-center rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success"
      >
        Stays through
      </span>

      <div
        role="tablist"
        aria-label="Competing categories"
        aria-orientation="horizontal"
        className="absolute inset-x-12 top-[60px] h-[100px]"
      >
        {COMPETITORS.map((c, i) => (
          <motion.div
            key={c.id}
            {...pinMotion(i)}
            className="absolute top-0 h-full"
            style={{
              left: `${c.trackPositionPercent}%`,
              transform: "translateX(-50%)",
            }}
          >
            <PinButton
              competitor={c}
              index={i}
              active={i === activeIndex}
              onSelect={onSelect}
              onKey={handleKey}
              registerRef={(el) => { registerTab(i, el); }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PinButton({
  competitor,
  index,
  active,
  onSelect,
  onKey,
  registerRef,
}: {
  competitor: Competitor;
  index: number;
  active: boolean;
  onSelect: (i: number) => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
  registerRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={registerRef}
      type="button"
      role="tab"
      id={`differentiation-tab-${competitor.id}`}
      aria-selected={active}
      aria-controls={DETAIL_PANEL_ID}
      aria-label={`${index + 1}: ${competitor.name}`}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(index)}
      onKeyDown={onKey}
      className="group flex h-full flex-col items-center focus:outline-none"
    >
      <span
        className={`text-xs font-medium ${
          active ? "text-white" : "text-slate-300"
        }`}
      >
        {competitor.name}
      </span>
      <span className="mt-0.5 text-[10px] text-slate-500">stops here</span>
      <span
        aria-hidden="true"
        className={`mt-1 h-[60px] w-px border-l border-dashed ${
          active ? "border-gold/60" : "border-slate-700"
        }`}
      />
      <span
        aria-hidden="true"
        className={`-mt-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy-950 text-[10px] font-semibold ring-2 transition-colors ${
          active
            ? "text-gold ring-gold group-focus-visible:ring-gold"
            : "text-slate-400 ring-slate-600 group-hover:ring-gold/60 group-focus-visible:ring-gold"
        }`}
      >
        {index + 1}
      </span>
    </button>
  );
}
