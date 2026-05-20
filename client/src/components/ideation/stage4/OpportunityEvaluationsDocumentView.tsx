'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <header>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {status === 'committed' ? 'Committed' : 'Pre-commit review'} · Opportunity Evaluations
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              Your opportunity evaluations — Stage 4 of 5
            </h1>
          </header>

          {chosen && (
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2">
                Advancing to Stage 5
              </h2>
              <article className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-3">
                <p className="text-sm text-foreground leading-snug mb-2">{chosen.painPointSummary}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>agent: {agentVerdictLabel(chosen.agentVerdict)}</span>
                  <span>· founder: {chosen.founderVerdict ? VERDICT_SHORT_LABELS[chosen.founderVerdict] : '—'}</span>
                  {chosen.layerBExtractedSignal && (
                    <span>· Layer B: {VALIDATION_STRENGTH_LABELS[chosen.layerBExtractedSignal.validationStrength]}</span>
                  )}
                </div>
              </article>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2">Why this one</h2>
            <p className="text-sm text-foreground leading-relaxed">{doc.chosenRationale}</p>
          </section>

          {others.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2">
                Why not the others <span className="text-muted-foreground">({others.length})</span>
              </h2>
              <p className="text-sm text-foreground leading-relaxed mb-3">{doc.rejectedRationale}</p>
              <ul className="space-y-2">
                {others.map(o => (
                  <li key={o.id} className="rounded-md border border-border bg-card/30 px-3 py-2 text-sm">
                    <p className="text-foreground leading-snug">{o.painPointSummary}</p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      agent: {agentVerdictLabel(o.agentVerdict)} ·
                      {' '}founder: {o.founderVerdict ? VERDICT_SHORT_LABELS[o.founderVerdict] : '—'}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actionError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {actionError}
            </div>
          )}

          <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <Button variant="ghost" onClick={() => router.push('/discovery')} disabled={busy}>
              Save and come back
            </Button>
            {status === 'output_ready' ? (
              <Button onClick={handleCommit} disabled={busy} className="ml-auto">
                I&apos;m ready for Stage 5
                <ArrowRight className="size-4 ml-1" />
              </Button>
            ) : (
              <span className="ml-auto text-sm text-muted-foreground">
                Committed · Stage 5 is still being built
              </span>
            )}
          </footer>

          <span className="hidden" data-session-id={sessionId} />
        </div>
      </div>
    </div>
  );
}
