'use client';
// src/app/(app)/discovery/recommendations/[id]/NoIdeaCascadeBanner.tsx
//
// Cascade-stale banner on the legacy Recommendation review surface for
// no_idea recommendations. Sits at the top of the page when
// Stage5AuthoringState.requiresRederivation is true.
//
// Copy locked in docs/stage5-copy-review.md § E. The "Re-synthesize"
// CTA POSTs to the existing synthesize route, then redirects to the
// Stage 5 surface to reuse the polling UI (per the question-for-review
// decision in E.2: "redirect back to Stage 5 to reuse the in-flight UI").

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCcw, Loader2 } from 'lucide-react';

interface NoIdeaCascadeBannerProps {
  sessionId: string;
}

export function NoIdeaCascadeBanner({ sessionId }: NoIdeaCascadeBannerProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  function handleResynthesize() {
    startTransition(async () => {
      setActionError(null);
      const res = await fetch(`/api/discovery/sessions/${sessionId}/stage5/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
      });
      if (res.status === 202) {
        // Redirect to the Stage 5 dispatcher so the polling UI takes
        // over. router.push (not replace) because the founder may want
        // to come back to this page if they bail.
        router.push(`/discovery/no-idea/${sessionId}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(data.error ?? `Couldn’t re-synthesize (HTTP ${res.status}).`);
    });
  }

  return (
    <section className="border-l-2 border-amber bg-bg-2 px-5 py-4">
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-amber">
        <AlertTriangle aria-hidden="true" className="size-3.5" />
        Evidence · changed since synthesis
      </div>
      <p className="mb-4 max-w-[680px] text-[14px] leading-[1.6] text-fg-2">
        You edited Stage 1, 2, 3, or 4 — the recommendation below was
        built from the prior state. Re-synthesize to pull your latest
        evidence in, or accept as-is if the change doesn&rsquo;t affect this
        opportunity.
      </p>
      <div className="flex flex-wrap items-center gap-3.5">
        <button
          type="button"
          onClick={handleResynthesize}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
        >
          {busy
            ? <><Loader2 aria-hidden="true" className="size-3.5 animate-spin" />Re-synthesizing…</>
            : <><RefreshCcw aria-hidden="true" className="size-3.5" />Re-synthesize</>}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          ~1 minute · replaces with a fresh synthesis from current Stage 1–4 state.
        </p>
      </div>
      {actionError && (
        <p className="mt-3 border-l-2 border-amber bg-bg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
          {actionError}
        </p>
      )}
    </section>
  );
}
