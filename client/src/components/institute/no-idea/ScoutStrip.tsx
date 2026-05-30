'use client';
// src/components/institute/no-idea/ScoutStrip.tsx
//
// Pain Scout control strip — the scout-run banner above the ledger.
// Italic-serif run number + mono description, accent run button. The
// button shows an in-flight spinner-text while scouting. Wires the
// existing scout job; doesn't reimplement it.

import { Loader2 } from 'lucide-react';

export interface ScoutStripProps {
  /** Number of runs fired so far (0-based for label rendering). */
  runCount:    number;
  /** Hard cap from constants (MAX_SCOUT_RUNS). */
  maxRuns:     number;
  scouting:    boolean;
  disabled?:   boolean;
  onScout:     () => void;
}

const ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function ScoutStrip({ runCount, maxRuns, scouting, disabled, onScout }: ScoutStripProps) {
  const nextRoman = ROMAN_UPPER[runCount] ?? String(runCount + 1);
  const atCap = runCount >= maxRuns;
  return (
    <div className="mt-7 grid max-w-[1100px] grid-cols-1 items-center gap-4 border border-rule bg-bg-2 px-6 py-4 sm:grid-cols-[1fr_auto] sm:gap-6">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        <span className="mr-2 font-serif text-[18px] italic normal-case tracking-[-0.01em] text-fg">
          Run No. {nextRoman} ·
        </span>
        Pain Scout · 8-step Sonnet · Tavily · Exa · <span className="text-accent">community_pulse</span>
        <span className="ml-3 text-muted-2">{runCount} of {maxRuns} fired</span>
      </div>
      <button
        type="button"
        onClick={onScout}
        disabled={scouting || atCap || disabled}
        className="inline-flex items-center gap-2.5 bg-accent px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {scouting && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
        {scouting ? 'Scouting · 8-step Sonnet' : atCap ? 'Scout cap reached' : 'Run scout'}
        {!scouting && !atCap && <span aria-hidden="true">⊙</span>}
      </button>
    </div>
  );
}
