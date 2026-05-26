'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Persists the dismissal across reloads of the same session so the
// banner does not re-appear after the founder closes it once.
const BANNER_KEY = (sessionId: string) => `neuralaunch:no-idea:stage1-banner:${sessionId}`;

interface Stage1BannerProps {
  sessionId: string;
  /** True when there are no prior messages — banner is shown automatically */
  forceVisible?: boolean;
}

/**
 * Dismissable Stage 1 introduction banner.
 *
 * Renders before the first founder message. Persists dismissal in
 * localStorage keyed by sessionId so a refresh mid-conversation does
 * not re-surface it.
 */
export function Stage1Banner({ sessionId, forceVisible }: Stage1BannerProps) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    // SSR-safe localStorage read pattern — once-per-mount client-state
    // probe. The
    // initial null render avoids a hydration mismatch when the banner
    // would otherwise show on the server and not on the client (or
    // vice-versa). Single setState; no cascading render risk.
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
      try {
        window.localStorage.setItem(BANNER_KEY(sessionId), '1');
      } catch {
        /* private mode / quota — banner just re-shows next time */
      }
    }
  };

  if (dismissed === null) return null;        // SSR pass — no flash
  if (dismissed && !forceVisible) return null;

  return (
    <div className="border-b border-border bg-card/40 px-4 py-4">
      <div className="mx-auto max-w-2xl flex items-start gap-3">
        <div className="flex-1 text-sm text-muted-foreground leading-relaxed">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground mb-1">
            Stage 1 of 5 — Outcome Definition
          </p>
          <p>
            Before we look for ideas, we need to know what outcome would actually fit your life.
            I&apos;ll ask you about four things: how soon you want results, what you want to
            earn, how much risk you can tolerate, and what kind of operation you actually want
            to be running. At the end you&apos;ll see an Outcome Document — a short
            plain-language picture of what you&apos;re aiming for — that you can sit with,
            edit, or push back on before we move on.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Stage 1 intro"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
