'use client';
// src/app/(app)/discovery/validation/[pageId]/BuildBriefPanel.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ConfirmedFeature {
  taskId:     string;
  title:      string;
  clicks:     number;
  percentage: number;
  evidence:   string;
}

interface RejectedFeature {
  taskId: string;
  title:  string;
  clicks: number;
  reason: string;
}

interface BuildBriefPanelProps {
  pageId:            string;
  signalStrength:    string;
  confirmedFeatures: ConfirmedFeature[];
  rejectedFeatures:  RejectedFeature[];
  surveyInsights:    string;
  buildBrief:        string;
  nextAction:        string;
  usedForMvp:        boolean;
  generatedAt:       string;
}

/**
 * BuildBriefPanel
 *
 * Renders the committed Opus Step 2 ValidationReport inline on the preview page.
 * Shows signal strength, confirmed/rejected features, verbatim survey insights,
 * the directive build brief, and a single next-action button.
 *
 * Includes a "Mark as my MVP spec" button that sets usedForMvp=true —
 * this is the handoff into Phase 5 (MVP build).
 */
export function BuildBriefPanel({
  pageId,
  signalStrength,
  confirmedFeatures,
  rejectedFeatures,
  surveyInsights,
  buildBrief,
  nextAction,
  usedForMvp: initialUsed,
  generatedAt,
}: BuildBriefPanelProps) {
  const router = useRouter();
  const [usedForMvp, setUsedForMvp] = useState(initialUsed);
  const [pending,    setPending]    = useState(false);

  async function handleMarkUsed() {
    setPending(true);
    try {
      const res = await fetch(`/api/discovery/validation/${pageId}/report`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ usedForMvp: true }),
      });
      if (res.ok) {
        setUsedForMvp(true);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  const signalStyles: Record<string, string> = {
    strong:   'bg-green-500/10 text-green-600 dark:text-green-400',
    moderate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    weak:     'bg-red-500/10 text-red-600 dark:text-red-400',
  };

  return (
    <div className="flex flex-col gap-5 pt-6 border-t border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Build brief</h3>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${signalStyles[signalStrength] ?? signalStyles.weak}`}>
          {signalStrength} signal
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Generated {new Date(generatedAt).toLocaleString()}
      </p>

      {/* Committed build brief */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-[10px] uppercase tracking-widest text-primary/70 mb-2">The call</p>
        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{buildBrief}</p>
      </div>

      {/* Confirmed features */}
      {confirmedFeatures.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">Build these</p>
          <div className="flex flex-col gap-2">
            {confirmedFeatures.map(f => (
              <div key={f.taskId} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">{f.title}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{f.clicks} clicks · {f.percentage}%</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{f.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rejected features */}
      {rejectedFeatures.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">Cut or defer</p>
          <div className="flex flex-col gap-2">
            {rejectedFeatures.map(f => (
              <div key={f.taskId} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground/70 line-through">{f.title}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{f.clicks} clicks</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{f.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Survey insights */}
      {surveyInsights && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">What people said</p>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap italic">{surveyInsights}</p>
          </div>
        </div>
      )}

      {/* Next action */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">Next 48 hours</p>
        <p className="text-xs text-foreground leading-relaxed">{nextAction}</p>
      </div>

      {/* MVP handoff */}
      <div className="pt-2">
        {usedForMvp ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-center">
            <p className="text-xs font-medium text-primary">This brief is your MVP spec</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { void handleMarkUsed(); }}
            disabled={pending}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Use as my MVP spec'}
          </button>
        )}
      </div>
    </div>
  );
}
