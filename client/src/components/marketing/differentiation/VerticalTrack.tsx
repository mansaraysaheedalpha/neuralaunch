"use client";

import { motion } from "motion/react";
import { COMPETITORS } from "./data";
import { DETAIL_PANEL_ID, type TrackVariantProps } from "./track-shared";

export function VerticalTrack({
  activeIndex,
  onSelect,
  handleKey,
  registerTab,
  lineMotion,
  pinMotion,
}: TrackVariantProps) {
  return (
    <div className="relative pl-8">
      <motion.div
        aria-hidden="true"
        {...lineMotion}
        style={{ transformOrigin: "top center" }}
        className="absolute bottom-2 left-3 top-2 w-0.5 rounded-full bg-gradient-to-b from-primary via-gold to-success"
      />
      <div
        aria-hidden="true"
        className="absolute left-3 top-0 -translate-x-1/2 text-[10px] uppercase tracking-wider text-slate-500"
      >
        LOST
      </div>
      <div
        aria-hidden="true"
        className="absolute -bottom-4 left-3 -translate-x-1/2 text-[10px] uppercase tracking-wider text-success"
      >
        LAUNCHED
      </div>

      <ol
        role="tablist"
        aria-label="Competing categories"
        aria-orientation="vertical"
        className="flex flex-col gap-3 py-6"
      >
        {COMPETITORS.map((c, i) => (
          <motion.li key={c.id} {...pinMotion(i)} className="relative">
            <button
              ref={(el) => { registerTab(i, el); }}
              type="button"
              role="tab"
              id={`differentiation-tab-${c.id}`}
              aria-selected={i === activeIndex}
              aria-controls={DETAIL_PANEL_ID}
              aria-label={`${i + 1}: ${c.name}`}
              tabIndex={i === activeIndex ? 0 : -1}
              onClick={() => onSelect(i)}
              onKeyDown={handleKey}
              className="flex w-full items-center gap-3 text-left focus:outline-none"
            >
              <span
                aria-hidden="true"
                className={`absolute -left-[18px] flex h-5 w-5 items-center justify-center rounded-full bg-navy-950 text-[10px] font-semibold ring-2 ${
                  i === activeIndex
                    ? "text-gold ring-gold"
                    : "text-slate-400 ring-slate-600"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1">
                <span
                  className={`block text-sm font-medium ${
                    i === activeIndex ? "text-white" : "text-slate-300"
                  }`}
                >
                  {c.name}
                </span>
                <span className="block text-[10px] text-slate-500">
                  stops here
                </span>
              </span>
            </button>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
