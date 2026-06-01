'use client';

import { Loader2 } from 'lucide-react';

interface ExtractionProgressProps {
  label?: string;
}

/**
 * Inline spinner shown while the vision pipeline is moderating +
 * extracting a freshly-uploaded screenshot. The community-response
 * route runs synchronously inside its 90s ceiling; this surface is
 * the founder-facing "we're working on it" affordance.
 */
export function ExtractionProgress({ label }: ExtractionProgressProps) {
  return (
    <div className="inline-flex items-center gap-2 border-l-2 border-accent bg-bg-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
      <Loader2 aria-hidden="true" className="size-3 animate-spin text-accent" />
      <span>{label ?? 'Reading your screenshot…'}</span>
    </div>
  );
}
