'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const BANNER_KEY = (sessionId: string) => `neuralaunch:no-idea:stage3-banner:${sessionId}`;

interface Stage3BannerProps {
  sessionId: string;
  forceVisible?: boolean;
}

/**
 * Dismissable Stage 3 introduction banner. Same persistence pattern
 * as Stage 1 + Stage 2 — localStorage keyed by sessionId.
 *
 * TODO(copy): final wording pending product-voice approval.
 */
export function Stage3Banner({ sessionId, forceVisible }: Stage3BannerProps) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
      return;
    }
    try {
      const stored = window.localStorage.getItem(BANNER_KEY(sessionId));
      setDismissed(stored === '1');
    } catch {
      setDismissed(false);
    }
  }, [sessionId]);

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(BANNER_KEY(sessionId), '1'); } catch { /* ignore */ }
    }
  };

  if (dismissed === null) return null;
  if (dismissed && !forceVisible) return null;

  return (
    <div className="border-b border-border bg-card/40 px-4 py-4">
      <div className="mx-auto max-w-3xl flex items-start gap-3">
        <div className="flex-1 text-sm text-muted-foreground leading-relaxed">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground mb-1">
            Stage 3 of 5 — Opportunity Identification
          </p>
          <p>
            Time to find real pain worth solving. Add pain points you&apos;ve hit yourself, lived with through someone close, or watched an industry struggle with — your own life is the strongest signal. The Pain Scout will surface community signals you might not have seen; treat its picks as a check on yourself, not the answer. Rate what survives on intensity, frequency, and niche specificity. I&apos;ll shortlist up to five for Stage 4.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Stage 3 intro"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
