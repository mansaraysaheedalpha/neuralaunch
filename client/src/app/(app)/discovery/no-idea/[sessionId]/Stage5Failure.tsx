'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage5Failure.tsx
//
// Failure surface for the Stage 5 worker — Institute treatment.
// Hairline, mono, amber-on-bg-2 eyebrow + serif italic heading +
// hairline-separated actions row. No red-box; no shadcn primitives.
// Mirrors SynthesisCommit's "the moment" grammar so the failure
// surface reads as a quiet pivot, not a panic.
//
// Copy locked in docs/stage5-copy-review.md § D. The error message is
// already sanitised server-side (sanitiseErrorMessage in job.ts strips
// stack traces, caps at 500 chars).

import { Loader2, RefreshCcw } from 'lucide-react';

interface Stage5FailureProps {
  errorMessage:    string;
  onRetry:         () => void;
  onRevisitStage4: () => void;
  retrying:        boolean;
}

export function Stage5Failure({
  errorMessage,
  onRetry,
  onRevisitStage4,
  retrying,
}: Stage5FailureProps) {
  return (
    <section className="max-w-[1320px] border-y border-rule px-6 py-12 sm:px-12 lg:px-20">
      <div className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-amber">
        Synthesis · didn&rsquo;t finish
      </div>
      <h3 className="mb-[18px] max-w-[920px] font-sans text-fg [font-size:clamp(28px,3.5vw,44px)] [font-weight:500] [line-height:1.04] [letter-spacing:-0.02em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        Synthesis didn&rsquo;t complete.<br />
        <em>One more try, then a second look.</em>
      </h3>

      <div className="mb-7 max-w-[680px] border-l-2 border-amber bg-bg-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
        {errorMessage}
      </div>

      <div className="flex flex-wrap items-start gap-3.5">
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-3 bg-accent px-6 py-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
        >
          {retrying
            ? <><Loader2 aria-hidden="true" className="size-4 animate-spin" />Retrying…</>
            : <><RefreshCcw aria-hidden="true" className="size-4" />Try synthesis again</>}
          {!retrying && <span aria-hidden="true">→</span>}
        </button>
        <button
          type="button"
          onClick={onRevisitStage4}
          disabled={retrying}
          className="border border-rule-strong px-6 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          ← Revisit Stage 4
        </button>
      </div>

      <div className="mt-5 grid max-w-[680px] gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        <span><span className="text-accent">Retry · </span> Synthesis costs are small. Retrying is the right first move.</span>
        <span><span className="text-accent">Revisit · </span> If retrying keeps failing, the inputs may need a second look.</span>
      </div>
    </section>
  );
}
