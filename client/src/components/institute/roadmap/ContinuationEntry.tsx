'use client';

import { useRouter } from 'next/navigation';

/**
 * ContinuationEntry — the "What's next?" card. Gated: the Run
 * continuation button enables only when the cycle is substantially
 * complete (≥ threshold) OR the founder marks it stalled. Routes to
 * the continuation flow. Visual grammar: roadmap.html .whats-next.
 */
export interface ContinuationEntryProps {
  roadmapId: string;
  completionPct: number;
  /** Enable threshold (0–100). Default 70. */
  threshold?: number;
}

export function ContinuationEntry({ roadmapId, completionPct, threshold = 70 }: ContinuationEntryProps) {
  const router = useRouter();
  const enabled = completionPct >= threshold;

  return (
    <div
      className="border border-accent px-5 py-[18px]"
      style={{ background: 'linear-gradient(180deg, rgba(255,90,60,0.08), rgba(255,90,60,0.02))' }}
    >
      <h4 className="mb-1.5 font-serif text-[22px] font-normal italic tracking-[-0.01em] text-fg">
        What&rsquo;s <span className="text-accent">next?</span>
      </h4>
      <p className="mb-3.5 text-[13px] leading-[1.5] text-fg-2">
        When you&rsquo;re substantially through — or stalled — I&rsquo;ll produce a
        five-section brief on what happened, what changed, and the forks ahead.
      </p>
      <button
        type="button"
        disabled={!enabled}
        onClick={() => router.push(`/discovery/roadmap/${roadmapId}/continuation`)}
        className={[
          'flex w-full items-center justify-center gap-2.5 px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
          enabled
            ? 'bg-accent text-bg transition-transform hover:translate-x-0.5'
            : 'cursor-not-allowed border border-rule-strong text-muted',
        ].join(' ')}
      >
        Run continuation
        {enabled && <span aria-hidden="true">→</span>}
      </button>
      {!enabled && (
        <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-muted">
          Available when you&rsquo;re substantially through, or stalled.
        </p>
      )}
    </div>
  );
}
