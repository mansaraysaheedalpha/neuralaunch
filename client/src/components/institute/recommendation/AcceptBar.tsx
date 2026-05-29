'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * AcceptBar — the sticky commit moment at the bottom of the content
 * column. Accent border + accent-soft gradient fill. "Push back
 * instead" focuses the rail; "Accept & build roadmap" fires the accept
 * action. Visual grammar: recommendation.html .accept-bar.
 *
 * Presentational — the consumer owns the accept handler + busy state.
 * When `freeTierSlot` is provided (Free tier), it replaces the accept
 * actions with an upgrade prompt.
 */
export interface AcceptBarProps {
  onAccept: () => void;
  onPushBack: () => void;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
  /** Replaces the accept actions when set (Free-tier upgrade prompt). */
  freeTierSlot?: ReactNode;
}

export function AcceptBar({
  onAccept,
  onPushBack,
  busy,
  busyLabel = 'Committing…',
  error,
  freeTierSlot,
}: AcceptBarProps) {
  if (freeTierSlot) {
    return (
      <div
        className="mt-14 border border-accent px-7 py-[22px]"
        style={{ background: 'linear-gradient(180deg, rgba(255,90,60,0.10), rgba(255,90,60,0.02))' }}
      >
        {freeTierSlot}
      </div>
    );
  }
  return (
    <div
      className="mt-14 border border-accent px-7 py-[22px]"
      style={{ background: 'linear-gradient(180deg, rgba(255,90,60,0.10), rgba(255,90,60,0.02))' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-[18px]">
        <div>
          <h3 className="font-sans text-[22px] font-medium tracking-[-0.01em] text-fg">
            Accept this recommendation?
          </h3>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            This becomes your roadmap · Cycle I begins on accept
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPushBack}
            className="inline-flex items-center gap-3 border border-rule-strong px-[22px] py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
          >
            ⚐ Push back instead
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="inline-flex items-center gap-3 bg-accent px-[22px] py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-opacity disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                {busyLabel}
              </>
            ) : (
              <>
                Accept &amp; build roadmap
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3 border border-amber px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
          {error}
        </div>
      )}
    </div>
  );
}
