'use client';
// src/app/(app)/settings/TrainingConsentSection.tsx

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface TrainingConsentSectionProps {
  initialConsent:    boolean;
  initialConsentedAt: string | null;
}

/**
 * Settings → Privacy → Training data toggle.
 *
 * The honest copy disclosure mirrors the inline opt-in card on the
 * outcome form. Two paths:
 *
 *   off → on   Sets the consent flag to true. Past outcomes
 *              submitted under the no-consent default stay
 *              anonymisedRecord=null. Only outcomes submitted from
 *              this point forward will have a training payload.
 *
 *   on → off   Sets the flag to false AND triggers the retroactive
 *              deletion sweep on every existing
 *              RecommendationOutcome row of the founder. The audit
 *              fact (consentedToTraining=true on the row) stays;
 *              the payload goes. The PATCH endpoint reports back
 *              how many records were purged so the founder gets a
 *              concrete confirmation that the retroactive deletion
 *              actually happened — not just a vague "settings updated."
 */
export function TrainingConsentSection({
  initialConsent,
  initialConsentedAt,
}: TrainingConsentSectionProps) {
  const [consent,     setConsent]     = useState(initialConsent);
  const [consentedAt, setConsentedAt] = useState<string | null>(initialConsentedAt);
  const [pending,     setPending]     = useState(false);
  const [purgedNotice, setPurgedNotice] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setPending(true);
    setPurgedNotice(null);
    try {
      const res = await fetch('/api/user/training-consent', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ consent: next }),
      });
      if (!res.ok) return;
      const json = await res.json() as {
        consent:        boolean;
        consentedAt:    string | null;
        purgedRecords?: number;
      };
      setConsent(json.consent);
      setConsentedAt(json.consentedAt);
      if (typeof json.purgedRecords === 'number' && json.purgedRecords > 0) {
        setPurgedNotice(
          `${json.purgedRecords} anonymised outcome record${json.purgedRecords === 1 ? '' : 's'} deleted from our training corpus.`,
        );
      } else if (next === false) {
        setPurgedNotice('Training data sharing turned off. No anonymised records remained to delete.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Help NeuraLaunch get better at recommendations
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            If this is on, an anonymised version of every outcome you submit will be stored and used to help NeuraLaunch give better recommendations to founders in similar situations to yours.
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
          We strip names, emails, phone numbers, and bucket your location to country level before storing the anonymised version. Free-text answers may still contain details we cannot automatically detect — if you wrote about a specific person or place, those words may be in the stored version.
        </p>
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          Anonymised records are kept for up to 24 months and then deleted automatically. Turning this off also deletes any anonymised records you have already shared — the historical fact that you once consented stays in our audit log, but the payload itself is gone.
        </p>
      </div>

      {consentedAt && (
        <p className="text-[10px] text-muted-foreground">
          You opted in on {new Date(consentedAt).toLocaleDateString()}.
        </p>
      )}

      {purgedNotice && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-foreground/80">
          {purgedNotice}
        </div>
      )}
    </div>
  );
}
