'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage5CascadeBanner.tsx
//
// Pre-synthesis cascade-stale banner shown above the chosen panel
// when Stage5AuthoringState.requiresRederivation is true. Different
// from the post-synthesis cascade banner on the Recommendation review
// surface (Stage5RecommendationAugmentations) — this one fires when an
// upstream stage was edited BEFORE the founder hit the CTA.
//
// Copy locked in docs/stage5-copy-review.md § A.5.

import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Stage5CascadeBannerProps {
  sessionId: string;
}

export function Stage5CascadeBanner({ sessionId }: Stage5CascadeBannerProps) {
  const router = useRouter();
  return (
    <div className="rounded-md border border-gold/40 bg-gold/5 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="size-4 text-gold mt-0.5 shrink-0" />
      <div className="flex-1 text-sm text-foreground leading-relaxed">
        <p className="mb-3">
          You updated Stage 1, 2, 3, or 4 — the chosen opportunity and reserves below were captured before that edit. If you fire the handoff now, the synthesis will read off the prior state. To rebuild from your fresh inputs, revisit Stage 4.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`/discovery/no-idea/${sessionId}`)}
        >
          Revisit Stage 4
        </Button>
      </div>
    </div>
  );
}
