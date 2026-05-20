'use client';

import { Loader2 } from 'lucide-react';

interface ExtractionProgressProps {
  /** TODO(copy): inline status text. */
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
    <div className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" />
      <span>{label ?? 'Reading your screenshot…'}</span>
    </div>
  );
}
