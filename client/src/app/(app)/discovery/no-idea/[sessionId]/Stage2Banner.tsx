'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const BANNER_KEY = (sessionId: string) => `neuralaunch:no-idea:stage2-banner:${sessionId}`;

interface Stage2BannerProps {
  sessionId: string;
  forceVisible?: boolean;
}

/**
 * Dismissable Stage 2 introduction banner. Same persistence pattern
 * as Stage1Banner — localStorage keyed by sessionId.
 *
 * TODO(copy): final wording pending product-voice approval.
 */
export function Stage2Banner({ sessionId, forceVisible }: Stage2BannerProps) {
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
            Stage 2 of 5 — Outcome Requirements
          </p>
          <p>
            Now we figure out what skills your committed outcome actually demands and rate where you (and any teammates) sit against those demands. The canvas on the left is the truth — you can drag chips between tiers directly, or talk to me and I&apos;ll move them as we go. At the end you&apos;ll have a Requirements Document: an Expected Profile, the gaps it surfaces, and what they mean for which opportunities Stage 3 can credibly send your way.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Stage 2 intro"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
