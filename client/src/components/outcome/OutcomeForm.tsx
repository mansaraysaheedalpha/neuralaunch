'use client';
// src/components/outcome/OutcomeForm.tsx

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  OUTCOME_COPY,
  OUTCOME_TYPE_VALUES,
  type OutcomeType,
} from '@/lib/outcome/outcome-types';

interface OutcomeFormProps {
  recommendationId: string;
  /**
   * Phase titles from the parent roadmap. The "which part needed
   * adjustment" follow-up offers these as multi-select chips.
   */
  phaseTitles:      string[];
  /**
   * Where the form was triggered from. Drives the heading copy.
   */
  surface: 'completion' | 'nudge' | 'session-block' | 'manual';
  /**
   * Called after successful submission OR explicit skip. The parent
   * decides whether to dismiss the form, close a modal, or refresh.
   */
  onDone: (result: { submitted: boolean; skipped: boolean }) => void;
}

interface ConsentState {
  consent: boolean;
  consentedAt: string | null;
}

/**
 * OutcomeForm
 *
 * The structured outcome submission form. Used in three places:
 *   1. Inline in the task card after the founder marks the final
 *      task complete (surface=completion)
 *   2. Inline at the top of the roadmap when the proactive nudge
 *      flagged a stale partial-complete (surface=nudge)
 *   3. As a modal blocking new session creation when an unfinished
 *      previous roadmap exists (surface=session-block)
 *
 * The form embeds the consent toggle inline on first use — if the
 * founder has not yet decided about training data, the toggle
 * appears below the outcome card list with the honest copy. If
 * they've already decided either way, we trust their choice and
 * the toggle is hidden.
 */
export function OutcomeForm({
  recommendationId,
  phaseTitles,
  surface,
  onDone,
}: OutcomeFormProps) {
  const [outcomeType, setOutcomeType] = useState<OutcomeType | null>(null);
  const [freeText,    setFreeText]    = useState('');
  const [weakPhases,  setWeakPhases]  = useState<string[]>([]);

  const [consent,     setConsent]     = useState<ConsentState | null>(null);
  const [consentLoadFailed, setConsentLoadFailed] = useState(false);
  const [pendingConsent, setPendingConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [skipping,   setSkipping]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Load the founder's current consent state on mount. If they have
  // not yet decided, the inline toggle is shown below the card list
  // with the honest disclosure copy.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/user/training-consent');
        if (!res.ok) {
          setConsentLoadFailed(true);
          return;
        }
        const json = await res.json() as ConsentState;
        setConsent(json);
      } catch {
        setConsentLoadFailed(true);
      }
    })();
  }, []);

  const copy = outcomeType ? OUTCOME_COPY[outcomeType] : null;
  const freeTextValid = !copy?.freeTextRequired || freeText.trim().length > 0;
  const canSubmit = outcomeType !== null && freeTextValid && !submitting;

  async function handleConsentToggle(next: boolean) {
    setPendingConsent(true);
    try {
      const res = await fetch('/api/user/training-consent', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ consent: next }),
      });
      if (!res.ok) return;
      const json = await res.json() as ConsentState;
      setConsent(json);
    } finally {
      setPendingConsent(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit || !outcomeType) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/discovery/recommendations/${recommendationId}/outcome`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcomeType,
          freeText:   freeText.trim() || undefined,
          weakPhases,
          consentedToTraining: consent?.consent ?? false,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not submit your outcome. Please try again.');
        return;
      }
      onDone({ submitted: true, skipped: false });
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      await fetch(`/api/discovery/recommendations/${recommendationId}/outcome`, {
        method: 'DELETE',
      });
      onDone({ submitted: false, skipped: true });
    } catch {
      // Skip failure is non-fatal — the founder is choosing not to
      // engage and we should respect that even if the bookkeeping
      // call fails.
      onDone({ submitted: false, skipped: true });
    } finally {
      setSkipping(false);
    }
  }

  // Heading copy varies by surface
  const heading = (() => {
    switch (surface) {
      case 'completion':    return 'You finished your roadmap. What did this journey teach you?';
      case 'nudge':         return 'It has been a while. What did this journey teach you?';
      case 'session-block': return 'Before you start a new session, what did the previous one teach you?';
      case 'manual':        return 'What did this journey teach you?';
    }
  })();

  const showInlineConsentCard = consent !== null && consent.consent === false;

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
          Pick the option that honestly describes how it went. There is no wrong answer — every result helps NeuraLaunch get better at recommendations for founders in situations like yours.
        </p>
      </div>

      {/* Outcome cards */}
      <div className="flex flex-col gap-2">
        {OUTCOME_TYPE_VALUES.map(type => {
          const c = OUTCOME_COPY[type];
          const selected = outcomeType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setOutcomeType(type)}
              className={[
                'text-left rounded-lg border px-4 py-3 transition-colors',
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-foreground/30',
              ].join(' ')}
            >
              <p className={[
                'text-xs font-semibold',
                selected ? 'text-primary' : 'text-foreground',
              ].join(' ')}>
                {c.cardTitle}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                {c.cardSubtitle}
              </p>
            </button>
          );
        })}
      </div>

      {/* Free-text follow-up */}
      {outcomeType && copy && (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
            {copy.freeTextRequired ? 'Required' : 'Optional'}
          </label>
          <textarea
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            placeholder={copy.freeTextPrompt}
            rows={4}
            className="resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      {/* Weak-phases follow-up — only for partial / direction-correct */}
      {outcomeType && copy?.showWeakPhasesFollowup && phaseTitles.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
            Which part of the roadmap needed the most adjustment? (optional, multi-select)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {phaseTitles.map(title => {
              const selected = weakPhases.includes(title);
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() =>
                    setWeakPhases(prev =>
                      prev.includes(title)
                        ? prev.filter(t => t !== title)
                        : [...prev, title],
                    )
                  }
                  className={[
                    'rounded-full px-3 py-1 text-[11px] font-medium border transition-colors',
                    selected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-foreground/30',
                  ].join(' ')}
                >
                  {title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline consent card — shown only when the founder has not
          yet decided either way. Honest disclosure of the limits. */}
      {showInlineConsentCard && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-2">
          <p className="text-[11px] font-medium text-foreground">
            Help NeuraLaunch get better at this
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            If you opt in, an anonymised version of this outcome will be used to help NeuraLaunch give better recommendations to founders in similar situations to yours. We strip names, emails, phone numbers, and bucket your location to country level before storing the anonymised version. Free-text answers may still contain details we cannot automatically detect — if you wrote about a specific person or place, those words may be in the stored version.
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Anonymised records are kept for up to 24 months and then deleted automatically. You can change your mind any time in Settings — turning this off also deletes any anonymised records you have already shared.
          </p>
          <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={consent?.consent ?? false}
              disabled={pendingConsent}
              onChange={e => { void handleConsentToggle(e.target.checked); }}
              className="rounded border-border"
            />
            <span className="text-[11px] text-foreground">
              Yes, use my anonymised outcome to improve recommendations for similar founders
            </span>
          </label>
        </div>
      )}

      {/* Already-decided consent reminder (subtle) */}
      {consent !== null && consent.consent === true && (
        <p className="text-[10px] text-muted-foreground italic">
          Your training-data sharing is on. You can change this in Settings → Privacy.
        </p>
      )}

      {consentLoadFailed && (
        <p className="text-[10px] text-gold">
          Could not load your training-data preference. Your outcome will be saved without sharing.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => { void handleSkip(); }}
          disabled={skipping || submitting}
          className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
        >
          {skipping ? 'Skipping…' : 'Skip for now'}
        </button>
        <button
          type="button"
          onClick={() => { void handleSubmit(); }}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          {submitting ? 'Submitting…' : 'Share outcome'}
        </button>
      </div>
    </div>
  );
}
