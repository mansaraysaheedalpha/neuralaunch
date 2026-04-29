'use client';
// src/app/(app)/discovery/recommendations/[ventureId]/transformation/TransformationReportView.tsx
//
// Client viewer for the Transformation Report. Polls the status
// endpoint and renders one of three states:
//
//   - in-flight (queued / loading_data / drafting / detecting_redactions
//                / persisting): step-progress ladder + spinner
//   - complete:                  the rendered narrative
//   - failed:                    error explanation
//
// Polling cadence mirrors the tool-jobs pattern: 3s when the tab
// is foregrounded, 30s when backgrounded, give up after 6 min.
// On terminal stages ('complete' / 'failed') polling stops.

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Sparkles, AlertTriangle, Check, Share2, Lock, EyeOff, ArrowLeft, Eraser, Pencil } from 'lucide-react';
import type {
  TransformationReport,
  DefaultSectionKey,
  RedactionCandidate,
  RedactionEdits,
  RedactionEditEntry,
} from '@/lib/transformation';
import { TRANSFORMATION_STAGES, type TransformationStage } from '@/lib/transformation';

interface ReportPayload {
  id:                  string;
  stage:               TransformationStage;
  errorMessage:        string | null;
  content:             TransformationReport | null;
  redactionCandidates: RedactionCandidate[];
  redactionEdits:      RedactionEdits;
  publishState:        string;
  /** ISO timestamp of when the story first went public, or null
   *  if it never has. The send-back banner uses this to detect
   *  whether the moderator's notes are FRESH (reviewedAt newer
   *  than publishedAt) vs stale carryover from a prior cycle. */
  publishedAt:         string | null;
  /** Moderator's notes when a story was sent back. Null when no
   *  send-back has happened (or after the founder re-submits). */
  reviewNotes:         string | null;
  /** Wall-clock of last moderator action — drives the
   *  "fresh feedback" detection: surface the banner only when
   *  reviewedAt > publishedAt OR publishedAt IS NULL. */
  reviewedAt:          string | null;
  venture:             { id: string; name: string; status: string };
}

const POLL_FOREGROUND_MS = 3_000;
const POLL_BACKGROUND_MS = 30_000;
const POLL_HARD_STOP_MS  = 6 * 60 * 1000;

const TERMINAL_STAGES: ReadonlySet<TransformationStage> = new Set(['complete', 'failed']);

const STAGE_LABELS: Record<TransformationStage, string> = {
  queued:               'Queued',
  loading_data:         'Reading every check-in, recommendation, and tool session',
  drafting:             'Writing your narrative',
  detecting_redactions: 'Reviewing for sensitive details',
  persisting:           'Saving',
  complete:             'Ready',
  failed:               'Failed',
};

const STAGE_ORDER: TransformationStage[] = [
  'queued',
  'loading_data',
  'drafting',
  // detecting_redactions is shown when present, but Commit 2
  // doesn't run it yet — it'll start appearing in the ladder when
  // Commit 3 ships the detector.
  'detecting_redactions',
  'persisting',
  'complete',
];

export function TransformationReportView({
  ventureId,
  initialVentureName,
}: {
  ventureId: string;
  initialVentureName: string;
}) {
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    // Side-effect initialisation — Date.now() is impure, which the
    // react-hooks/purity rule forbids in the component body. Setting
    // it inside useEffect is the supported pattern.
    startedAt.current = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchOnce() {
      try {
        const res = await fetch(`/api/discovery/ventures/${ventureId}/transformation`, {
          method: 'GET',
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as { error?: string };
          setError(json.error ?? 'Could not load your transformation report.');
          return;
        }
        const json = await res.json() as ReportPayload;
        if (cancelled) return;
        setReport(json);
        setError(null);

        const elapsed = Date.now() - startedAt.current;
        if (TERMINAL_STAGES.has(json.stage)) return;
        if (elapsed >= POLL_HARD_STOP_MS) {
          setError('Generation is taking longer than expected. Refresh the page in a minute or two — your report will be there when it\'s done.');
          return;
        }

        const delay = document.hidden ? POLL_BACKGROUND_MS : POLL_FOREGROUND_MS;
        timer = setTimeout(() => { void fetchOnce(); }, delay);
      } catch {
        if (!cancelled) setError('Network error — please refresh.');
      }
    }

    void fetchOnce();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ventureId]);

  // Visible scaffold while the very first fetch is in flight.
  if (!report && !error) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col items-center gap-3">
        <Loader2 className="size-5 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading your transformation report…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  // Terminal failure path
  if (report.stage === 'failed') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-foreground">{report.venture.name}</h1>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-foreground">
              We couldn&apos;t finish your transformation report.
            </p>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {report.errorMessage ?? 'Something went wrong during generation.'}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              The venture is still marked complete. To regenerate, reopen it (within 24h of marking complete) and mark complete again — that fires a fresh report.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // In-flight path — step ladder
  if (report.stage !== 'complete') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">{report.venture.name}</h1>
          <p className="text-sm text-muted-foreground">
            Generating your transformation report.
          </p>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Sparkles className="size-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-foreground/90 leading-relaxed">
              I&apos;m reading every cycle, every check-in you wrote, and every tool you used to write a personal narrative of how this venture went. Takes about 30 seconds.
              <br />
              <span className="text-xs text-muted-foreground">
                You can close this tab — it&apos;ll be ready when you come back, and a notification will fire if you have push enabled.
              </span>
            </p>
          </div>

          <ul className="flex flex-col gap-2 mt-1">
            {STAGE_ORDER.filter(s => s !== 'detecting_redactions' || report.stage === 'detecting_redactions').map((s) => {
              const completed = isStageBefore(s, report.stage);
              const active    = s === report.stage;
              const pending   = !completed && !active;
              return (
                <li key={s} className="flex items-center gap-2 text-[12px]">
                  {completed && <Check className="size-3.5 text-success shrink-0" />}
                  {active    && <Loader2 className="size-3.5 text-primary animate-spin shrink-0" />}
                  {pending   && <span className="size-3.5 rounded-full border border-muted-foreground/30 shrink-0" />}
                  <span className={
                    completed ? 'text-foreground/80'
                  : active    ? 'text-foreground font-medium'
                  :             'text-muted-foreground'
                  }>
                    {STAGE_LABELS[s]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // Terminal success path — render the narrative
  if (!report.content) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-sm text-muted-foreground">
          Your transformation report finished generating but the content failed to parse. Try refreshing — if it persists, regenerate by reopening and re-marking the venture complete.
        </p>
      </div>
    );
  }

  return (
    <NarrativeWithPublishFlow
      ventureId={ventureId}
      report={report}
      ventureName={report.venture.name || initialVentureName}
      onUpdate={setReport}
    />
  );
}

// ---------------------------------------------------------------------------
// Top-level wrapper for the complete-state UX. Holds the local
// publish-flow mode (reading | warned | editing) and renders one of
// three sub-views accordingly.
// ---------------------------------------------------------------------------

type PublishMode = 'reading' | 'warned' | 'editing';

function NarrativeWithPublishFlow({
  ventureId,
  report,
  ventureName,
  onUpdate,
}: {
  ventureId:   string;
  report:      ReportPayload;
  ventureName: string;
  onUpdate:    (r: ReportPayload) => void;
}) {
  const [mode, setMode] = useState<PublishMode>('reading');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!report.content) return null;

  // Send-back banner — moderator reviewed the founder's
  // submission and routed it back for revision. Surface only
  // when there's a fresh review (reviewedAt > publishedAt OR
  // publishedAt is null, meaning the story has never been
  // public). Once the founder edits + re-submits, publishState
  // flips back to 'pending_review' and this banner disappears.
  const hasFreshReview =
    report.publishState === 'private'
    && report.reviewNotes !== null
    && report.reviewedAt !== null
    && (report.publishedAt === null || report.reviewedAt > report.publishedAt);

  const sendBackBanner = hasFreshReview ? (
    <SendBackBanner notes={report.reviewNotes!} reviewedAt={report.reviewedAt!} />
  ) : null;

  // Publish-state-driven status banner above the report.
  const banner =
    report.publishState === 'public' ? (
      <PublishStateBanner
        kind="public"
        onUnpublish={async () => {
          await runPatch(ventureId, { action: 'unpublish' }, onUpdate, setSubmitting, setError);
        }}
        submitting={submitting}
      />
    )
    : report.publishState === 'pending_review' ? (
      <PublishStateBanner
        kind="pending_review"
        onUnpublish={async () => {
          await runPatch(ventureId, { action: 'unpublish' }, onUpdate, setSubmitting, setError);
        }}
        submitting={submitting}
      />
    )
    : sendBackBanner;

  return (
    <>
      {banner}

      <NarrativeRender ventureName={ventureName} content={report.content} />

      {/* The publish flow renders BELOW the narrative — the founder
          has already read their story before they make the choice. */}
      <div className="max-w-2xl mx-auto px-6 pb-12">
        {mode === 'reading' && report.publishState === 'private' && (
          <ReadingModeFooter
            onWantToShare={() => { setError(null); setMode('warned'); }}
          />
        )}
        {mode === 'warned' && (
          <PreShareWarning
            onContinue={() => setMode('editing')}
            onCancel={() => setMode('reading')}
          />
        )}
        {mode === 'editing' && report.content && (
          <RedactionEditor
            candidates={report.redactionCandidates}
            initialEdits={report.redactionEdits}
            error={error}
            submitting={submitting}
            onBack={() => { setError(null); setMode('reading'); }}
            onSaveEdits={async (edits) => {
              await runPatch(ventureId, { redactionEdits: edits }, onUpdate, setSubmitting, setError);
            }}
            onPublish={async (edits) => {
              const ok = await runPatch(
                ventureId,
                { redactionEdits: edits, action: 'publish' },
                onUpdate,
                setSubmitting,
                setError,
              );
              if (ok) setMode('reading');
            }}
          />
        )}
      </div>
    </>
  );
}

async function runPatch(
  ventureId: string,
  body: { redactionEdits?: RedactionEdits; action?: 'publish' | 'unpublish' },
  onUpdate: (r: ReportPayload) => void,
  setSubmitting: (b: boolean) => void,
  setError: (e: string | null) => void,
): Promise<boolean> {
  setSubmitting(true);
  setError(null);
  try {
    const res = await fetch(`/api/discovery/ventures/${ventureId}/transformation`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string };
      setError(json.error ?? 'Could not save your changes.');
      return false;
    }
    // Refetch the row so the UI sees the canonical persisted state
    // (publishState changes, etc.) without a page reload.
    const refresh = await fetch(`/api/discovery/ventures/${ventureId}/transformation`, { method: 'GET' });
    if (refresh.ok) {
      const json = await refresh.json() as ReportPayload;
      onUpdate(json);
    }
    return true;
  } catch {
    setError('Network error — please try again.');
    return false;
  } finally {
    setSubmitting(false);
  }
}

// ---------------------------------------------------------------------------
// Publish-state banners + reading-mode footer
// ---------------------------------------------------------------------------

function PublishStateBanner({
  kind,
  onUnpublish,
  submitting,
}: {
  kind:        'public' | 'pending_review';
  onUnpublish: () => Promise<void>;
  submitting:  boolean;
}) {
  const isPublic = kind === 'public';
  return (
    <div className="max-w-2xl mx-auto px-6 pt-6">
      <div className={`rounded-xl border ${isPublic ? 'border-success/30 bg-success/5' : 'border-amber-500/30 bg-amber-500/5'} px-4 py-3 flex items-start gap-3`}>
        {isPublic
          ? <Share2 className="size-4 text-success mt-0.5 shrink-0" />
          : <Lock   className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />}
        <div className="flex-1 flex flex-col gap-1.5">
          <p className="text-[12px] font-semibold text-foreground">
            {isPublic ? 'Shared publicly' : 'Pending review for the public archive'}
          </p>
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            {isPublic
              ? 'Your redacted story is live in the public archive. The private version above is still just for you.'
              : 'You\'ve submitted this story to the public archive. It\'s waiting on review before going live.'}
          </p>
          <button
            type="button"
            onClick={() => { void onUnpublish(); }}
            disabled={submitting}
            className="self-start inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <EyeOff className="size-3" />
            {submitting ? 'Working…' : 'Unpublish'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SendBackBanner({
  notes,
  reviewedAt,
}: {
  notes:      string;
  reviewedAt: string;
}) {
  const reviewed = new Date(reviewedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });
  return (
    <div className="max-w-2xl mx-auto px-6 pt-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 flex flex-col gap-1.5">
          <p className="text-[12px] font-semibold text-foreground">
            Your submission needs a revision before it can go on the public archive
          </p>
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            <span className="font-medium">Note from review ({reviewed}):</span> {notes}
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Edit your redaction choices below, then click &ldquo;Confirm and publish&rdquo; again to re-submit.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReadingModeFooter({ onWantToShare }: { onWantToShare: () => void }) {
  return (
    <div className="mt-12 rounded-xl border border-border bg-card px-5 py-4 flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
        <Share2 className="size-3.5 text-primary" />
        Want to share this with other founders?
      </p>
      <p className="text-[12px] text-muted-foreground leading-relaxed">
        Other founders read real journeys on the public archive — yours could help someone deciding whether to keep going. You stay in control: the next step is a redaction editor where you choose exactly what gets published.
      </p>
      <button
        type="button"
        onClick={onWantToShare}
        className="self-start inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Make this story shareable publicly
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-share warning — user explicitly asked for this. The button
// does NOT publish; it opens the redaction editor.
// ---------------------------------------------------------------------------

function PreShareWarning({
  onContinue,
  onCancel,
}: {
  onContinue: () => void;
  onCancel:   () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-12 rounded-xl border border-amber-500/40 bg-amber-500/5 px-5 py-4 flex flex-col gap-3"
    >
      <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
        <Lock className="size-3.5 text-amber-600 dark:text-amber-400" />
        Before you share — you stay in control
      </p>
      <p className="text-[12px] text-foreground/90 leading-relaxed">
        This is the kind of story other founders read on the public archive — your real journey, in your own words. <span className="font-semibold">Nothing leaves your account until you confirm the redaction step.</span>
      </p>
      <p className="text-[12px] text-foreground/90 leading-relaxed">
        On the next screen you&apos;ll see exactly what will be shared and choose what to redact — names, business names, locations, specific numbers. Continuing only opens the editor; it does not publish.
      </p>
      <p className="text-[11px] text-muted-foreground italic leading-relaxed">
        Auto-redacted regardless of your choices: emails, phone numbers, full names, your first name, large currency amounts.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Continue to redaction editor
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Not yet
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Redaction editor — per-candidate keep / redact / replace controls.
// Confirm at the bottom flips publishState to pending_review.
// ---------------------------------------------------------------------------

function RedactionEditor({
  candidates,
  initialEdits,
  error,
  submitting,
  onBack,
  onSaveEdits,
  onPublish,
}: {
  /** Reserved for an inline preview in a future pass — keeping the
   *  prop name in the call site doesn't help the linter today. */
  candidates:   RedactionCandidate[];
  initialEdits: RedactionEdits;
  error:        string | null;
  submitting:   boolean;
  onBack:       () => void;
  onSaveEdits:  (edits: RedactionEdits) => Promise<void>;
  onPublish:    (edits: RedactionEdits) => Promise<void>;
}) {
  // Initialise edits with whatever the founder previously saved,
  // falling back to the candidate's own suggestion as the default
  // action.
  const [edits, setEdits] = useState<RedactionEdits>(() => {
    const seeded: RedactionEdits = {};
    for (const c of candidates) {
      const prior = initialEdits[c.id];
      if (prior) {
        seeded[c.id] = prior;
      } else {
        seeded[c.id] = {
          action:      c.suggestion,
          replacement: c.suggestion === 'replace' ? c.replacement : null,
        };
      }
    }
    return seeded;
  });

  function setEntry(id: string, entry: RedactionEditEntry) {
    setEdits(prev => ({ ...prev, [id]: entry }));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-12 flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Back
        </button>
        <p className="text-[11px] uppercase tracking-widest text-primary/70 font-semibold">
          Redaction editor
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card px-5 py-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-foreground">
          Choose what gets shared publicly
        </p>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Below are the items I&apos;ve flagged as potentially sensitive. For each one, choose to <span className="font-semibold text-foreground">redact</span> (substitute with [redacted]), <span className="font-semibold text-foreground">replace</span> with your own generic phrase, or <span className="font-semibold text-foreground">keep</span> in the public version. Auto-redacted items (emails, phone numbers, full names, large currency) don&apos;t appear here — those are always redacted regardless.
        </p>
        {candidates.length === 0 && (
          <p className="text-[12px] text-foreground/80 leading-relaxed italic">
            No additional sensitive content was flagged beyond the auto-redacted baseline. Your story is ready to publish as-is.
          </p>
        )}
        {candidates.map(c => (
          <CandidateRow
            key={c.id}
            candidate={c}
            entry={edits[c.id] ?? { action: c.suggestion, replacement: null }}
            onChange={(entry) => setEntry(c.id, entry)}
          />
        ))}
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { void onPublish(edits); }}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {submitting ? <Loader2 className="size-3 animate-spin" /> : <Share2 className="size-3" />}
          Confirm and publish
        </button>
        <button
          type="button"
          onClick={() => { void onSaveEdits(edits); }}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Save and finish later
        </button>
      </div>

      {/* Reference content stays visible above (NarrativeRender), so
          the founder can see what they're redacting in context.
          AnimatePresence here as a no-op — placeholder for future
          inline-preview enhancements without restructuring. */}
      <AnimatePresence />
    </motion.div>
  );
}

function CandidateRow({
  candidate,
  entry,
  onChange,
}: {
  candidate: RedactionCandidate;
  entry:     RedactionEditEntry;
  onChange:  (entry: RedactionEditEntry) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-foreground break-words">
            <span className="font-mono bg-muted px-1 py-0.5 rounded">{candidate.text}</span>
            <span className="ml-2 text-[9px] uppercase tracking-wider text-muted-foreground/70">
              {candidate.type.replace('_', ' ')}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{candidate.rationale}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {(['keep', 'redact', 'replace'] as const).map(action => {
          const active = entry.action === action;
          const Icon = action === 'keep' ? Check : action === 'redact' ? Eraser : Pencil;
          return (
            <button
              key={action}
              type="button"
              onClick={() => onChange({
                action,
                replacement: action === 'replace' ? (entry.replacement ?? candidate.replacement ?? '') : null,
              })}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                active
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-2.5" />
              {action.charAt(0).toUpperCase() + action.slice(1)}
            </button>
          );
        })}
      </div>
      {entry.action === 'replace' && (
        <input
          type="text"
          value={entry.replacement ?? ''}
          onChange={e => onChange({ action: 'replace', replacement: e.target.value })}
          placeholder="Generic substitute (e.g. 'a logistics company in West Africa')"
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      )}
    </div>
  );
}

function isStageBefore(a: TransformationStage, b: TransformationStage): boolean {
  return TRANSFORMATION_STAGES.indexOf(a) < TRANSFORMATION_STAGES.indexOf(b);
}

// ---------------------------------------------------------------------------
// Narrative renderer — respects sectionOrder, drops nulled sections,
// renders custom sections at the end. Treats the report as a piece
// of writing (no hierarchical heading clutter) — section title +
// prose body, that's the rhythm.
// ---------------------------------------------------------------------------

const SECTION_TITLES: Record<DefaultSectionKey, string> = {
  startingPoint:     'Where you started',
  centralChallenge:  'The real thing you were stuck on',
  decisivePivots:    'Decisive pivots',
  whatYouLearned:    'What you learned',
  whatYouBuilt:      'What you built',
  honestStruggles:   'Honest struggles',
  endingPoint:       'Where you are now',
  closingReflection: '',  // rendered without a title — it's the personal sign-off
};

function NarrativeRender({
  ventureName,
  content,
}: {
  ventureName: string;
  content:    TransformationReport;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8"
    >
      <header className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-widest text-primary/70 font-semibold">
          Your transformation report
        </p>
        <h1 className="text-3xl font-bold text-foreground leading-tight">
          {ventureName}
        </h1>
        <p className="text-sm text-muted-foreground">
          A personal narrative of how this venture went, written from your own check-ins, tools, and outcomes.
        </p>
      </header>

      {content.sectionOrder.map((key) => (
        <DefaultSection key={key} sectionKey={key} content={content} />
      ))}

      {content.customSections && content.customSections.length > 0 && (
        <div className="flex flex-col gap-8">
          {content.customSections.map((cs, i) => (
            <section key={i} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">{cs.heading}</h2>
              <Prose body={cs.body} />
            </section>
          ))}
        </div>
      )}
    </motion.article>
  );
}

function DefaultSection({
  sectionKey,
  content,
}: {
  sectionKey: DefaultSectionKey;
  content:    TransformationReport;
}) {
  const title = SECTION_TITLES[sectionKey];

  switch (sectionKey) {
    case 'decisivePivots': {
      const pivots = content.decisivePivots;
      if (!pivots || pivots.length === 0) return null;
      return (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <ul className="flex flex-col gap-4">
            {pivots.map((p, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-sm font-medium text-foreground">{p.moment}</p>
                <p className="text-[13px] text-foreground/80 leading-relaxed">{p.why}</p>
                <p className="text-[12px] text-muted-foreground italic leading-relaxed">{p.change}</p>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case 'closingReflection': {
      const body = content.closingReflection;
      return (
        <section className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 flex flex-col gap-1.5">
          <p className="text-[10px] uppercase tracking-widest text-primary/70 font-semibold">
            For you
          </p>
          <Prose body={body} />
        </section>
      );
    }
    default: {
      const body = content[sectionKey];
      if (typeof body !== 'string' || body.length === 0) return null;
      return (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <Prose body={body} />
        </section>
      );
    }
  }
}

function Prose({ body }: { body: string }) {
  // Render newline-separated paragraphs as <p> with comfortable
  // line-height. Don't run a full markdown parser — the schema
  // describes prose, not formatted markup.
  const paragraphs = body.split(/\n{2,}/).filter(p => p.trim().length > 0);
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-[14px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </div>
  );
}
