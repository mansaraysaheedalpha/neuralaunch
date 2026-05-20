'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const BANNER_KEY = (sessionId: string) => `neuralaunch:no-idea:stage4-banner:${sessionId}`;

interface Stage4BannerProps {
  sessionId: string;
  forceVisible?: boolean;
}

/**
 * Dismissable Stage 4 introduction banner. Same persistence pattern
 * as Stage 1/2/3 — localStorage keyed by sessionId.
 *
 * TODO(copy): banner heading + body copy pending product-voice approval.
 */
export function Stage4Banner({ sessionId, forceVisible }: Stage4BannerProps) {
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
            Stage 4 of 5 — Opportunity Evaluation
          </p>
          {/* TODO(copy): banner body */}
          <p>
            Time to put your shortlisted pain points to the test. For each opportunity, I&apos;ll research four dimensions (market reality, customer access, willingness to pay, market size) — that&apos;s Layer A. Then you post a test script on your own accounts and bring back what real people say — that&apos;s Layer B. Both layers feed a verdict you can push back on. We&apos;ll advance the strongest one to Stage 5.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Stage 4 intro"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
