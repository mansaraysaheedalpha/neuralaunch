"use client";

import { motion } from "motion/react";
import type { KeyboardEvent } from "react";
import { COMPETITORS, JOURNEY_PHASES, type Competitor } from "./data";
import { DETAIL_PANEL_ID, type TrackVariantProps } from "./track-shared";

const PHASE_BAND_TOP = 0;
const PHASE_BAND_HEIGHT = 32; // label (~14) + gap (4) + segment (6) + slack
const PIN_TABLIST_TOP = PHASE_BAND_HEIGHT + 24; // breathing room below band
const TRACK_BOTTOM_INSET_PX = 40; // gradient line distance from bottom

export function HorizontalTrack({
  activeIndex,
  onSelect,
  handleKey,
  registerTab,
  lineMotion,
  pinMotion,
}: TrackVariantProps) {
  return (
    <div className="relative h-[300px] w-full lg:h-[340px]">
      {/* Phase band — top row, full width inside the line's horizontal range */}
      <div
        aria-hidden="true"
        className="absolute inset-x-12 grid grid-cols-5 gap-1"
        style={{ top: `${PHASE_BAND_TOP}px` }}
      >
        {JOURNEY_PHASES.map((phase) => (
          <div key={phase} className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {phase}
            </span>
            <span className="h-1.5 w-full rounded-full bg-slate-800" />
          </div>
        ))}
      </div>

      {/* Pin tablist — fills the space between phase band and gradient line.
          Pin column ends exactly at the gradient line's vertical center, so
          each ring centers on the line via translate-y-1/2. */}
      <div
        role="tablist"
        aria-label="Competing categories"
        aria-orientation="horizontal"
        className="absolute inset-x-12"
        style={{
          top: `${PIN_TABLIST_TOP}px`,
          bottom: `${TRACK_BOTTOM_INSET_PX + 1}px`,
        }}
      >
        {COMPETITORS.map((c, i) => (
          <motion.div
            key={c.id}
            {...pinMotion(i)}
            className="absolute inset-y-0 -translate-x-1/2"
            style={{ left: `${c.trackPositionPercent}%` }}
          >
            <PinButton
              competitor={c}
              index={i}
              active={i === activeIndex}
              onSelect={onSelect}
              onKey={handleKey}
              registerRef={(el) => {
                registerTab(i, el);
              }}
            />
          </motion.div>
        ))}
      </div>

      {/* Static baseline */}
      <div
        aria-hidden="true"
        className="absolute inset-x-12 h-px bg-slate-800"
        style={{ bottom: `${TRACK_BOTTOM_INSET_PX + 7}px` }}
      />

      {/* NeuraLaunch gradient line — runs the full distance */}
      <motion.div
        aria-hidden="true"
        {...lineMotion}
        style={{
          transformOrigin: "left center",
          bottom: `${TRACK_BOTTOM_INSET_PX}px`,
        }}
        className="absolute inset-x-12 h-0.5 rounded-full bg-gradient-to-r from-primary via-gold to-success"
      />

      {/* LOST / LAUNCHED axis labels — bottom row, flanking the line */}
      <span className="absolute bottom-3 left-0 text-xs uppercase tracking-wider text-slate-500">
        LOST
      </span>
      <span className="absolute bottom-3 right-0 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        LAUNCHED
      </span>
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
      className="group relative flex h-full w-max flex-col items-center focus:outline-none"
    >
      <span
        className={`block whitespace-nowrap text-center text-xs font-medium transition-colors ${
          active ? "text-white" : "text-slate-300 group-hover:text-slate-200"
        }`}
      >
        {competitor.name}
      </span>
      {active && (
        <span
          aria-hidden="true"
          className="mt-0.5 block whitespace-nowrap text-[10px] text-gold"
        >
          stops here &darr;
        </span>
      )}

      {/* Dotted vertical connector — runs from below the label group down to
          where the ring is. Behind the ring (z-0). */}
      <span
        aria-hidden="true"
        className={`absolute left-1/2 z-0 w-px -translate-x-1/2 border-l border-dashed transition-colors ${
          active ? "border-gold/60" : "border-slate-600"
        }`}
        style={{ top: active ? 36 : 22, bottom: 0 }}
      />

      {/* Numbered ring — anchored at column bottom, translated down by half
          its own height so its center sits exactly on the gradient line. */}
      <span
        aria-hidden="true"
        className={`absolute bottom-0 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full bg-navy-950 text-[10px] font-semibold ring-2 transition-colors ${
          active
            ? "text-gold ring-gold"
            : "text-slate-400 ring-slate-600 group-hover:ring-gold/60 group-focus-visible:ring-gold"
        }`}
      >
        {index + 1}
      </span>
    </button>
  );
}
