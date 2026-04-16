'use client';
// src/app/(app)/discovery/validation/[pageId]/BuildBriefPanel.tsx

import { useState } from 'react';
import Link         from 'next/link';
import { useRouter } from 'next/navigation';
import type { ConfirmedFeature, RejectedFeature } from '@/lib/validation/schemas';

interface PivotOption {
  title:     string;
  rationale: string;
}

interface BuildBriefPanelProps {
  pageId:                  string;
  signalStrength:          string;
  confirmedFeatures:       ConfirmedFeature[];
  rejectedFeatures:        RejectedFeature[];
  surveyInsights:          string;
  buildBrief:              string;
  nextAction:              string;
  usedForMvp:              boolean;
  generatedAt:             string;
  disconfirmedAssumptions: string[];
  pivotOptions:            PivotOption[];
}

/**
 * BuildBriefPanel
 *
 * Renders the committed Opus Step 2 ValidationReport. Branches heavily on
 * signalStrength:
 *
 *   - 'strong' | 'moderate' | 'weak'
 *       Shows "The call", confirmed/rejected features, verbatim survey
 *       insights, and the "Use as my MVP spec" handoff button.
 *
 *   - 'negative'
 *       Red/amber styled card. Hides the MVP handoff button entirely.
 *       Shows "What the market said no to", disconfirmed assumptions,
 *       pivot options, and a "Start a new discovery session" CTA.
 *       Founders cannot accidentally carry a discredited brief forward.
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
  disconfirmedAssumptions,
  pivotOptions,
}: BuildBriefPanelProps) {
  const router = useRouter();
  const [usedForMvp, setUsedForMvp] = useState(initialUsed);
  const [pending,    setPending]    = useState(false);

  const isNegative = signalStrength === 'negative';

  async function handleMarkUsed() {
    if (isNegative) return; // safety — button should not render at all
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
    strong:   'bg-success/10 text-success',
    moderate: 'bg-gold/10 text-gold',
    weak:     'bg-gold/10 text-gold',
    negative: 'bg-red-500/10 text-red-600 dark:text-red-400',
  };

  return (
    <div className="flex flex-col gap-5 pt-6 border-t border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {isNegative ? 'The market said no' : 'Build brief'}
        </h3>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${signalStyles[signalStrength] ?? signalStyles.weak}`}>
          {signalStrength} signal
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Generated {new Date(generatedAt).toLocaleString()}
      </p>

      {/* Committed brief — style differs for negative */}
      <div className={
        isNegative
          ? 'rounded-xl border border-red-500/30 bg-red-500/5 p-4'
          : 'rounded-xl border border-primary/20 bg-primary/5 p-4'
      }>
        <p className={
          isNegative
            ? 'text-[10px] uppercase tracking-widest text-red-500/80 mb-2'
            : 'text-[10px] uppercase tracking-widest text-primary/70 mb-2'
        }>
          {isNegative ? 'The honest read' : 'The call'}
        </p>
        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{buildBrief}</p>
      </div>

      {/* Disconfirmed assumptions — only on negative */}
      {isNegative && disconfirmedAssumptions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">What the data contradicted</p>
          <ul className="flex flex-col gap-2">
            {disconfirmedAssumptions.map((a, i) => (
              <li key={i} className="rounded-lg border border-red-500/20 bg-card p-3">
                <p className="text-[11px] text-foreground/90 leading-relaxed">{a}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Confirmed features — skipped on negative (may be empty anyway) */}
      {!isNegative && confirmedFeatures.length > 0 && (
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
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">
            {isNegative ? 'No interest in' : 'Cut or defer'}
          </p>
          <div className="flex flex-col gap-2">
            {rejectedFeatures.map(f => (
              <div key={f.taskId} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground/70">{f.title}</p>
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

      {/* Pivot options — only on negative */}
      {isNegative && pivotOptions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">Adjacent paths worth considering</p>
          <div className="flex flex-col gap-2">
            {pivotOptions.map((p, i) => (
              <div key={i} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-medium text-foreground">{p.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{p.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next action */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">
          {isNegative ? 'What to do instead' : 'Next 48 hours'}
        </p>
        <p className="text-xs text-foreground leading-relaxed">{nextAction}</p>
      </div>

      {/* Handoff CTA — different paths for positive vs negative */}
      <div className="pt-2">
        {isNegative ? (
          <Link
            href="/discovery"
            className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start a new discovery session
          </Link>
        ) : usedForMvp ? (
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
