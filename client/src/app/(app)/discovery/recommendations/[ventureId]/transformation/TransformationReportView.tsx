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
import { motion } from 'motion/react';
import { Loader2, Sparkles, AlertTriangle, Check } from 'lucide-react';
import type { TransformationReport, DefaultSectionKey } from '@/lib/transformation';
import { TRANSFORMATION_STAGES, type TransformationStage } from '@/lib/transformation';

interface ReportPayload {
  id:           string;
  stage:        TransformationStage;
  errorMessage: string | null;
  content:      TransformationReport | null;
  publishState: string;
  venture:      { id: string; name: string; status: string };
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
    <NarrativeRender
      ventureName={report.venture.name || initialVentureName}
      content={report.content}
    />
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
