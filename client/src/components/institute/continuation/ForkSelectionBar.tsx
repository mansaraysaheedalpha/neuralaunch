'use client';

import { Loader2 } from 'lucide-react';

/**
 * ForkSelectionBar — sticky bottom commit bar. Status line on the left
 * (chosen fork or "No fork chosen"), [Reopen diagnostic] ghost +
 * [Begin Cycle N+1] primary on the right. Commit disabled until a fork
 * is chosen. Visual grammar: continuation.html .pick-bar.
 */
export interface ForkSelectionBarProps {
  /** Next cycle roman numeral, e.g. "II". */
  nextCycleRoman: string;
  /** Selected fork letter, e.g. "A" — null when none chosen. */
  selectedLetter: string | null;
  committing: boolean;
  /** True once a fork has been committed (terminal). */
  committed: boolean;
  onReopen: () => void;
  onCommit: () => void;
}

export function ForkSelectionBar({
  nextCycleRoman,
  selectedLetter,
  committing,
  committed,
  onReopen,
  onCommit,
}: ForkSelectionBarProps) {
  return (
    <footer
      className="sticky bottom-0 z-40 flex flex-wrap items-center justify-between gap-3 border-t border-rule px-6 py-[18px] font-mono text-[11px] uppercase tracking-[0.14em] text-muted backdrop-blur-md sm:px-12 lg:px-20"
      style={{ background: 'color-mix(in oklab, var(--bg) 94%, transparent)' }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span>Cycle {nextCycleRoman} begins on fork selection</span>
        <span className={selectedLetter ? 'text-accent' : 'text-muted'}>
          {committed
            ? `Fork ${selectedLetter} · committed`
            : selectedLetter
              ? `Fork ${selectedLetter} · selected`
              : 'No fork chosen'}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onReopen}
          disabled={committing}
          className="border border-rule-strong px-[18px] py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Reopen diagnostic
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={!selectedLetter || committing || committed}
          className="inline-flex items-center gap-2.5 bg-accent px-[18px] py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg disabled:opacity-30"
        >
          {committing && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          Begin Cycle {nextCycleRoman}
          {!committing && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </footer>
  );
}
