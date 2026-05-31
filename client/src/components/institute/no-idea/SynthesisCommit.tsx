'use client';
// src/components/institute/no-idea/SynthesisCommit.tsx
//
// Stage 5 synthesis commit band — "the moment." Mono label, big
// italic-serif H3 with the time estimate, paragraph explaining what
// Opus reasons across, and the actions row (primary commit + ghost
// back + meta line).

import { Loader2 } from 'lucide-react';

export interface SynthesisCommitProps {
  /** Primary CTA — fires the synthesize POST. */
  onCommit:       () => void;
  /** Ghost CTA — routes back to Stage 4 verdicts. */
  onEditVerdicts: () => void;
  /** Busy state — drives the spinner-text on the primary. */
  busy?:         boolean;
  /** Disable the commit — set when the cascade gate fires. */
  disabled?:     boolean;
  /** Optional error banner (e.g. "Couldn't start synthesis · HTTP 503"). */
  error?:        string | null;
}

export function SynthesisCommit({
  onCommit,
  onEditVerdicts,
  busy,
  disabled,
  error,
}: SynthesisCommitProps) {
  return (
    <section
      className="max-w-[1320px] border-y border-rule px-6 py-12 sm:px-12 lg:px-20"
      style={{ background: 'linear-gradient(180deg, rgba(255,90,60,0.04), transparent)' }}
    >
      <div className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        The moment
      </div>
      <h3 className="mb-[18px] max-w-[920px] font-sans text-fg [font-size:clamp(32px,4vw,52px)] [font-weight:500] [line-height:1.02] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        Commit to synthesis.<br />
        <em>About 90 seconds.</em>
      </h3>
      <p className="mb-7 max-w-[600px] text-[16px] leading-[1.55] text-fg-2 [&_strong]:font-medium [&_strong]:text-fg">
        Opus reasons across everything you&rsquo;ve committed — your outcome,
        your skill profile, the pain inventory, the chosen opportunity&rsquo;s
        Layer A and Layer B signals. Sonnet formats. The output is your first{' '}
        <strong>Recommendation</strong>.
      </p>
      {error && (
        <p className="mb-5 max-w-[600px] border-l-2 border-amber bg-bg-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3.5">
        <button
          type="button"
          onClick={onCommit}
          disabled={busy || disabled}
          className="inline-flex items-center gap-3 bg-accent px-6 py-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
        >
          {busy && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {busy ? 'Starting synthesis' : 'Commit · run synthesis'}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
        <button
          type="button"
          onClick={onEditVerdicts}
          disabled={busy}
          className="border border-rule-strong px-6 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          ← Edit verdicts
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Opus 4.6 · Sonnet bridge · resumable
        </span>
      </div>
    </section>
  );
}
