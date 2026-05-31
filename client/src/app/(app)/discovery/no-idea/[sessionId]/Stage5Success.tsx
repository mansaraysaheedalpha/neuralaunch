'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage5Success.tsx
//
// Success transition for the Stage 5 worker. Renders the single
// "Done. Loading your recommendation…" line then router.replace's to
// the recommendation review surface.
//
// Copy locked in docs/stage5-copy-review.md § C. router.replace (not
// push) so the back button skips the Stage 5 page — going back after
// synthesis is confusing.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

interface Stage5SuccessProps {
  sessionId:        string;
  recommendationId: string;
}

export function Stage5Success({ sessionId, recommendationId }: Stage5SuccessProps) {
  const router = useRouter();

  useEffect(() => {
    // sessionId is not used in the redirect target but kept on props
    // for telemetry/testing parity with the rest of the surface.
    void sessionId;
    router.replace(`/discovery/recommendations/${recommendationId}`);
  }, [router, recommendationId, sessionId]);

  return (
    <section className="rounded-lg border border-success/30 bg-success/5 px-4 py-5">
      <p className="text-sm text-fg flex items-center gap-2">
        <Check className="size-4 text-success" />
        Done. Loading your recommendation…
      </p>
    </section>
  );
}
