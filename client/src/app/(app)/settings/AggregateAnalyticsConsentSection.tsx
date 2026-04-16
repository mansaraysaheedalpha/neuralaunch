'use client';
// src/app/(app)/settings/AggregateAnalyticsConsentSection.tsx

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface AggregateAnalyticsConsentSectionProps {
  initialConsent:     boolean;
  initialConsentedAt: string | null;
}

/**
 * Settings -> Privacy -> Aggregate analytics toggle.
 *
 * Separate from training-data consent. This governs whether
 * NeuraLaunch may include the founder's data in aggregate,
 * non-identifiable analytics (completion rates by category,
 * common blockers, average time-to-launch).
 *
 * Unlike training consent, revoking does NOT trigger retroactive
 * deletion — aggregated counts cannot be "unglued." The founder
 * is simply excluded from future computations.
 */
export function AggregateAnalyticsConsentSection({
  initialConsent,
  initialConsentedAt,
}: AggregateAnalyticsConsentSectionProps) {
  const [consent,     setConsent]     = useState(initialConsent);
  const [consentedAt, setConsentedAt] = useState<string | null>(initialConsentedAt);
  const [pending,     setPending]     = useState(false);

  async function handleToggle(next: boolean) {
    setPending(true);
    try {
      const res = await fetch('/api/user/aggregate-analytics-consent', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ consent: next }),
      });
      if (!res.ok) return;
      const json = await res.json() as {
        consent:     boolean;
        consentedAt: string | null;
      };
      setConsent(json.consent);
      setConsentedAt(json.consentedAt);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Include my data in aggregate analytics
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            If this is on, your completion rates, common blockers, and category choices are counted in aggregate statistics that help us understand how founders use NeuraLaunch. These are percentages and totals across all users — never tied to you individually.
          </p>
        </div>
        <label className="inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={consent}
            disabled={pending}
            onChange={e => { void handleToggle(e.target.checked); }}
            className="size-5 rounded border-border"
          />
          {pending && <Loader2 className="ml-2 size-3 animate-spin text-muted-foreground" />}
        </label>
      </div>

      <div className="border-t border-border pt-4 flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
          The honest disclosure
        </p>
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          Aggregate analytics are counts and percentages — &quot;42% of founders in the SaaS category completed their roadmap&quot; — not individual records. Your name, email, and specific answers are never part of these aggregates.
        </p>
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          Because aggregates are mathematical summaries across all users, turning this off excludes you from future computations but cannot retroactively remove your contribution to past totals. This is fundamentally different from the training data toggle above, which deletes your individual records.
        </p>
      </div>

      {consentedAt && (
        <p className="text-[10px] text-muted-foreground">
          You opted in on {new Date(consentedAt).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
