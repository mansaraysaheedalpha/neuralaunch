"use client";

import { useRef, type KeyboardEvent } from "react";
import type { Archetype } from "./data";

const SPOTLIGHT_PANEL_ID = "archetype-spotlight";

export type ArchetypeSelectorProps = {
  archetypes: Archetype[];
  activeIndex: number;
  onSelect: (index: number) => void;
  reducedMotion: boolean;
};

export function ArchetypeSelector({
  archetypes,
  activeIndex,
  onSelect,
  reducedMotion,
}: ArchetypeSelectorProps) {
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = archetypes.length - 1;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = activeIndex === last ? 0 : activeIndex + 1;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = activeIndex === 0 ? last : activeIndex - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    if (next === null) return;
    e.preventDefault();
    onSelect(next);
    tabsRef.current[next]?.focus();
  };

  return (
    <div>
      {/* Vertical list — lg+ */}
      <div
        role="tablist"
        aria-label="Archetypes"
        aria-orientation="vertical"
        className="hidden flex-col gap-1 lg:flex"
      >
        {archetypes.map((a, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={a.id}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`archetype-tab-${a.id}`}
              aria-selected={active}
              aria-controls={SPOTLIGHT_PANEL_ID}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(i)}
              onKeyDown={handleKey}
              className={`group flex flex-col items-start gap-0.5 border-l-[3px] py-3 pl-4 pr-3 text-left transition-colors focus:outline-none focus-visible:bg-navy-800/60 ${
                active
                  ? "border-l-gold bg-navy-800/60"
                  : "border-l-transparent hover:bg-navy-800/30"
              }`}
            >
              <span
                className={`text-sm font-semibold ${
                  active ? "text-white" : "text-slate-200"
                }`}
              >
                {a.role}
              </span>
              <span className="text-xs text-slate-400">{a.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Horizontal pill row — md/sm */}
      <div
        role="tablist"
        aria-label="Archetypes"
        aria-orientation="horizontal"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] snap-x snap-mandatory lg:hidden"
      >
        {archetypes.map((a, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={a.id}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`archetype-tab-${a.id}`}
              aria-selected={active}
              aria-controls={SPOTLIGHT_PANEL_ID}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(i)}
              onKeyDown={handleKey}
              className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 ${
                active
                  ? "border-gold/40 bg-gold/5 text-white"
                  : "border-slate-800 bg-transparent text-slate-300 hover:border-slate-700"
              }`}
            >
              {a.role}
            </button>
          );
        })}
      </div>

      {reducedMotion && (
        <p className="mt-3 text-xs text-slate-500">
          Pick an archetype to see the shift.
        </p>
      )}
    </div>
  );
}

export { SPOTLIGHT_PANEL_ID };
