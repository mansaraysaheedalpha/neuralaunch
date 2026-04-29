'use client';
// src/app/admin/stories/[reportId]/AdminReviewForm.tsx
//
// Right-column action form on the admin review page. Three
// possible action submissions: approve (with editable
// cardSummary + outcome label), send_back (with reviewNotes
// shown to founder), or decline (with reviewNotes kept
// internal). Each posts to /api/admin/transformation/[reportId]
// and routes back to /admin/stories on success.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, AlertTriangle, X, Send } from 'lucide-react';
import {
  OUTCOME_LABELS,
  type TransformationCardSummary,
  type OutcomeLabel,
} from '@/lib/transformation';

const OUTCOME_DISPLAY: Record<OutcomeLabel, { label: string; classes: string }> = {
  shipped:     { label: 'SHIPPED',     classes: 'border-success/40 bg-success/10 text-success' },
  walked_away: { label: 'WALKED AWAY', classes: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  pivoted:     { label: 'PIVOTED',     classes: 'border-primary/40 bg-primary/10 text-primary' },
  learning:    { label: 'LEARNING',    classes: 'border-slate-700 bg-slate-800/40 text-slate-300' },
};

export interface AdminReviewFormProps {
  reportId:            string;
  ventureName:         string;
  currentPublishState: string;
  initialCardSummary:  TransformationCardSummary;
  initialOutcome:      OutcomeLabel;
  initialReviewNotes:  string;
}

export function AdminReviewForm({
  reportId,
  ventureName,
  currentPublishState,
  initialCardSummary,
  initialOutcome,
  initialReviewNotes,
}: AdminReviewFormProps) {
  const router = useRouter();
  const [openingQuote, setOpeningQuote]   = useState(initialCardSummary.openingQuote);
  const [setup, setSetup]                 = useState(initialCardSummary.setup);
  const [closingQuote, setClosingQuote]   = useState(initialCardSummary.closingQuote);
  const [moderatorNote, setModeratorNote] = useState(initialCardSummary.moderatorNote ?? '');
  const [outcome, setOutcome]             = useState<OutcomeLabel>(initialOutcome);
  const [reviewNotes, setReviewNotes]     = useState(initialReviewNotes);
  const [submitting, setSubmitting]       = useState<'approve' | 'send_back' | 'decline' | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  const isPendingReview = currentPublishState === 'pending_review';

  async function postAction(body: object) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/transformation/${reportId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Action failed.');
        return false;
      }
      router.push('/admin/stories');
      router.refresh();
      return true;
    } catch {
      setError('Network error — please try again.');
      return false;
    }
  }

  async function handleApprove() {
    setSubmitting('approve');
    await postAction({
      action:       'approve',
      outcomeLabel: outcome,
      cardSummary: {
        openingQuote:  openingQuote.trim(),
        setup:         setup.trim(),
        closingQuote:  closingQuote.trim(),
        moderatorNote: moderatorNote.trim().length > 0 ? moderatorNote.trim() : null,
      },
    });
    setSubmitting(null);
  }

  async function handleSendBack() {
    if (reviewNotes.trim().length === 0) {
      setError('Send-back requires a note for the founder.');
      return;
    }
    setSubmitting('send_back');
    await postAction({
      action:      'send_back',
      reviewNotes: reviewNotes.trim(),
    });
    setSubmitting(null);
  }

  async function handleDecline() {
    if (reviewNotes.trim().length === 0) {
      setError('Decline requires an internal note (not shown to the founder, but kept for your records).');
      return;
    }
    setSubmitting('decline');
    await postAction({
      action:      'decline',
      reviewNotes: reviewNotes.trim(),
    });
    setSubmitting(null);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-navy-900/40 px-6 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Card content (the public face)
        </h2>
        <p className="text-[11px] text-slate-500">
          What readers see on the marketing strip + /stories index. Auto-derived from the report; edit before approving.
        </p>

        <Field label="Opening pull-quote" hint="Italic gold, top of card. 2-3 lines max in the rendered output.">
          <textarea
            value={openingQuote}
            onChange={e => setOpeningQuote(e.target.value)}
            rows={3}
            disabled={!isPendingReview}
            className={inputClass}
          />
        </Field>

        <Field label="Setup paragraph" hint="Slate text below the opening. 2 lines max.">
          <textarea
            value={setup}
            onChange={e => setSetup(e.target.value)}
            rows={3}
            disabled={!isPendingReview}
            className={inputClass}
          />
        </Field>

        <Field label="Closing pull-quote" hint="White, at the bottom of the card.">
          <textarea
            value={closingQuote}
            onChange={e => setClosingQuote(e.target.value)}
            rows={2}
            disabled={!isPendingReview}
            className={inputClass}
          />
        </Field>

        <Field label="Moderator note (optional, featured cards only)" hint="One line, e.g. &lsquo;Why this story matters: …&rsquo;">
          <input
            type="text"
            value={moderatorNote}
            onChange={e => setModeratorNote(e.target.value)}
            disabled={!isPendingReview}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-navy-900/40 px-6 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Outcome chip
        </h2>
        <div className="flex flex-wrap gap-2">
          {OUTCOME_LABELS.map(label => {
            const display = OUTCOME_DISPLAY[label];
            const active = outcome === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setOutcome(label)}
                disabled={!isPendingReview}
                className={[
                  'inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest transition-opacity',
                  display.classes,
                  active ? 'opacity-100 ring-2 ring-white/30' : 'opacity-50 hover:opacity-80',
                  !isPendingReview && 'cursor-not-allowed',
                ].filter(Boolean).join(' ')}
              >
                {display.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-navy-900/40 px-6 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Review notes
        </h2>
        <p className="text-[11px] text-slate-500">
          For send-back: surfaced to the founder as a banner in their private viewer.
          For decline: kept internal (the founder is never told why).
        </p>
        <textarea
          value={reviewNotes}
          onChange={e => setReviewNotes(e.target.value)}
          rows={4}
          disabled={!isPendingReview}
          className={inputClass}
          placeholder="What to tell the founder (or yourself)…"
        />
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">
          {error}
        </p>
      )}

      {!isPendingReview && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-400">
          This report is in <span className="font-mono">{currentPublishState}</span>. Actions are disabled — only stories in <span className="font-mono">pending_review</span> can be moderated.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { void handleApprove(); }}
          disabled={!isPendingReview || submitting !== null}
          className="inline-flex items-center gap-1.5 rounded-md bg-success px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting === 'approve' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Approve &amp; publish
        </button>

        <button
          type="button"
          onClick={() => { void handleSendBack(); }}
          disabled={!isPendingReview || submitting !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[12px] font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
        >
          {submitting === 'send_back' ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Send back
        </button>

        <button
          type="button"
          onClick={() => { void handleDecline(); }}
          disabled={!isPendingReview || submitting !== null}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2 text-[12px] font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {submitting === 'decline' ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          Decline silently
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        Reviewing &ldquo;{ventureName}&rdquo;
        {!isPendingReview && (
          <> · <AlertTriangle className="inline size-3 text-amber-400" /> No action available in current state.</>
        )}
      </p>
    </section>
  );
}

const inputClass =
  'w-full rounded-md border border-slate-800 bg-navy-950/60 px-3 py-2 text-[13px] text-slate-100 ' +
  'placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/40 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed resize-none';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint:  string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-slate-300">{label}</span>
      <span className="text-[10px] text-slate-500">{hint}</span>
      {children}
    </label>
  );
}
