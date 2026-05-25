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
import { Button } from '@/components/ui/button';

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
    <div className="mx-6 mt-4 rounded-md border border-gold/40 bg-gold/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-4 text-gold mt-0.5 shrink-0" />
        <div className="flex-1 text-sm text-foreground leading-relaxed">
          <p>
            Your evidence changed since this recommendation was synthesized. You edited Stage 1, 2, 3, or 4 — the recommendation below was built from the prior state. Re-synthesize to pull your latest evidence in, or accept as-is if the change doesn&apos;t affect this opportunity.
          </p>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={handleResynthesize} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Re-synthesizing…
                </>
              ) : (
                <>
                  <RefreshCcw className="size-4 mr-1" />
                  Re-synthesize
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Takes ~1 minute. Replaces the recommendation below with a fresh synthesis from your current Stage 1-4 state.
            </p>
          </div>
          {actionError && (
            <p className="mt-2 text-xs text-destructive">{actionError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
