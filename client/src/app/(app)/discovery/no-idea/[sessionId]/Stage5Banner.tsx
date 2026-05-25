'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// localStorage key, scoped per sessionId so dismissals do not leak
// between sessions belonging to the same user.
const BANNER_KEY = (sessionId: string) => `neuralaunch:no-idea:stage5-banner:${sessionId}`;

interface Stage5BannerProps {
  sessionId:     string;
  forceVisible?: boolean;
}

/**
 * Dismissable Stage 5 introduction banner. Mirrors the persistence +
 * SSR-safe pattern from Stage1/2/3/4 banners. Copy locked in docs/
 * stage5-copy-review.md § A.2.
 */
export function Stage5Banner({ sessionId, forceVisible }: Stage5BannerProps) {
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
            Stage 5 of 5 — Validation Handoff
          </p>
          <p>
            You picked your opportunity in Stage 4. I&apos;ll now take everything you&apos;ve built — outcome, requirements, pain inventory, the opportunity itself — and synthesize it into your handoff document. That&apos;s what you&apos;ll take into the next phase to actually validate demand. The alternatives you set aside stay with the handoff in case you need to fork later.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Stage 5 intro"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
