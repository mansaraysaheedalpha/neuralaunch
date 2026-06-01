'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { OpportunityEvaluationsDocument, OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import type { OpportunityVerdict } from '@neuralaunch/constants';
import { VERDICT_SHORT_LABELS, VALIDATION_STRENGTH_LABELS } from './labels';

/** Type-safe verdict label — handles 'pending' (synthesizer hasn't fired yet). */
function agentVerdictLabel(v: OpportunityEvaluation['agentVerdict']): string {
  if (v === 'pending') return 'pending';
  return VERDICT_SHORT_LABELS[v as OpportunityVerdict];
}

interface OpportunityEvaluationsDocumentViewProps {
  stageRunId: string;
  sessionId:  string;
  status:     'output_ready' | 'committed';
  document:   OpportunityEvaluationsDocument;
}

/**
 * Review-mode surface for Stage 4's committed artifact. Shows the
 * chosen #1 prominently, the rationale prose ("why this one and not
 * the others"), all evaluations with their final verdicts, plus the
 * commit-or-continue footer.
 */
export function OpportunityEvaluationsDocumentView({
  stageRunId,
  sessionId,
  status,
  document: doc,
}: OpportunityEvaluationsDocumentViewProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const chosen = doc.evaluations.find(o => o.id === doc.chosenOpportunityId) ?? null;
  const others = doc.evaluations.filter(o => o.id !== doc.chosenOpportunityId);

  const handleCommit = () => {
    startTransition(async () => {
      setActionError(null);
      const res = await fetch(`/api/ideation/stage-runs/${stageRunId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setActionError(data.error ?? `Could not commit (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-6 py-10 sm:px-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <header className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              {status === 'committed' ? 'Committed' : 'Pre-commit review'} · Opportunity Evaluations · Stage IV of V
            </p>
            <h1 className="font-sans text-fg [font-size:clamp(28px,3.5vw,44px)] [font-weight:500] [line-height:1.04] [letter-spacing:-0.02em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
              Your <em>opportunity evaluations.</em>
            </h1>
          </header>

          {chosen && (
            <section className="flex flex-col gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Advancing to Stage V
              </p>
              <article className="border-l-2 border-accent bg-bg-2 px-5 py-4">
                <p className="mb-2 text-[15px] leading-snug text-fg">{chosen.painPointSummary}</p>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  Agent · <span className="text-fg">{agentVerdictLabel(chosen.agentVerdict)}</span>
                  {' · '}Founder · <span className="text-fg">{chosen.founderVerdict ? VERDICT_SHORT_LABELS[chosen.founderVerdict] : '—'}</span>
                  {chosen.layerBExtractedSignal && (
                    <> · Layer B · <span className="text-fg">{VALIDATION_STRENGTH_LABELS[chosen.layerBExtractedSignal.validationStrength]}</span></>
                  )}
                </div>
              </article>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Why this one
            </p>
            <p className="text-[15px] leading-[1.65] text-fg">{doc.chosenRationale}</p>
          </section>

          {others.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Why not the others · {others.length}
              </p>
              <p className="text-[15px] leading-[1.65] text-fg">{doc.rejectedRationale}</p>
              <ul className="flex flex-col gap-2 pt-1">
                {others.map(o => (
                  <li key={o.id} className="border border-rule bg-bg-2 px-4 py-3">
                    <p className="text-[14px] leading-snug text-fg">{o.painPointSummary}</p>
                    <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      Agent · <span className="text-fg">{agentVerdictLabel(o.agentVerdict)}</span>
                      {' · '}Founder · <span className="text-fg">{o.founderVerdict ? VERDICT_SHORT_LABELS[o.founderVerdict] : '—'}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actionError && (
            <p className="border-l-2 border-amber bg-bg-2 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
              {actionError}
            </p>
          )}

          <footer className="flex flex-wrap items-center gap-3 border-t border-rule pt-6">
            <button
              type="button"
              onClick={() => router.push('/discovery')}
              disabled={busy}
              className="border border-rule-strong px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Save and come back
            </button>
            {status === 'output_ready' ? (
              <button
                type="button"
                onClick={handleCommit}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-3 bg-accent px-5 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
              >
                I&apos;m ready for Stage V
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </button>
            ) : (
              // Status='committed' is reached after handleCommit; the
              // router.refresh() that follows usually routes the founder
              // straight to Stage 5 (the dispatcher finds the freshly-
              // lazy-created Stage 5 row active). This branch is only
              // reachable on a stale page render (back-button, cached
              // RSC), so we surface a navigate-forward link rather than
              // claim a non-existent build state.
              <button
                type="button"
                onClick={() => router.push(`/discovery/no-idea/${sessionId}`)}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-3 bg-accent px-5 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
              >
                Continue to Stage V
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </footer>

          <span className="hidden" data-session-id={sessionId} />
        </div>
      </div>
    </div>
  );
}
