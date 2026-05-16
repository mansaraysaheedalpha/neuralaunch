'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OutcomeDocument } from '@/lib/ideation/stage1-outcome/schema';
import { OutcomeDocumentChat } from './OutcomeDocumentChat';

type EditableDim = 'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference';

interface OutcomeDocumentViewProps {
  stageRunId: string;
  sessionId:  string;
  status:     'output_ready' | 'committed';
  document:   OutcomeDocument;
}

const DIM_LABELS: Record<EditableDim, string> = {
  timeHorizon:         'Time horizon',
  financialGoal:       'Financial goal',
  riskTolerance:       'Risk tolerance',
  lifestylePreference: 'Lifestyle preference',
};

/**
 * Review-mode renderer for the committed / output_ready
 * OutcomeDocument. Supports four affordances:
 *
 *   - Ask a question about this — stubbed (disabled with tooltip)
 *   - Edit a dimension          — reopens authoring scoped to one dim
 *   - Save and come back        — no-op affordance (router back)
 *   - I'm ready for Stage 2     — commit + redirect (or "go to Stage 2"
 *                                  when status is already 'committed')
 */
export function OutcomeDocumentView({
  stageRunId,
  sessionId,
  status,
  document,
}: OutcomeDocumentViewProps) {
  const router = useRouter();
  // pendingAction tracks which mutation is in flight so we can disable
  // EVERY interactive control (every edit pencil + commit + save) until
  // the mutation resolves AND the page server-component has re-rendered.
  // Previously this used useTransition with an async callback, but
  // useTransition's "pending" state only covers the SYNCHRONOUS part of
  // the callback — the moment `await fetch(...)` is hit, the transition
  // resolves and the busy flag flips false. That left a window where
  // a founder could fire a SECOND edit click while the first edit's
  // network round-trip was still in flight. The first edit reverted
  // the row to 'authoring'; the second edit then 409'd with "Stage row
  // is not in a finalised state". Manual state tracking closes the
  // window. We deliberately do NOT clear pendingAction on success —
  // router.refresh() triggers a server-component re-render that will
  // either replace this view entirely (edit → chat surface) or refresh
  // it with new state (commit → committed-mode). Either way the next
  // render gets a fresh component with a fresh null pendingAction.
  type PendingAction = 'commit' | EditableDim;
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const isPending = pendingAction !== null;

  const handleCommit = async () => {
    if (isPending) return;
    setActionError(null);
    setPendingAction('commit');
    try {
      const res = await fetch(`/api/ideation/stage-runs/${stageRunId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setActionError(data.error ?? `Could not commit (HTTP ${res.status})`);
        setPendingAction(null);
        return;
      }
      // Don't clear pendingAction — router.refresh re-renders the page;
      // the new render comes back with a fresh pendingAction = null.
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Commit failed');
      setPendingAction(null);
    }
  };

  const handleEdit = async (target: EditableDim) => {
    if (isPending) return;
    setActionError(null);
    setPendingAction(target);
    try {
      const res = await fetch(`/api/ideation/stage-runs/${stageRunId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dimension: target }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setActionError(data.error ?? `Could not start edit (HTTP ${res.status})`);
        setPendingAction(null);
        return;
      }
      // Same as handleCommit — leave pendingAction set; the upcoming
      // re-render replaces this component with the chat surface.
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Edit failed');
      setPendingAction(null);
    }
  };

  const renderDimValue = (key: EditableDim) => {
    const dim = document.dimensions[key];
    if (dim.value === null) return <span className="text-muted-foreground">Not captured</span>;
    if (key === 'financialGoal') {
      const v = dim.value as OutcomeDocument['dimensions']['financialGoal']['value'];
      if (v === null) return <span className="text-muted-foreground">Not captured</span>;
      const target = v.target ? ` — ${v.target}` : '';
      return <span>{labelFor(v.shape)}{target}</span>;
    }
    return <span>{labelFor(String(dim.value))}</span>;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <header className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {status === 'committed' ? 'Committed' : 'Pre-commit review'}
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              Your outcome — Stage 1 of 5
            </h1>
          </header>

          <section className="mb-8">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              The four dimensions
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(DIM_LABELS) as EditableDim[]).map(key => (
                <div
                  key={key}
                  className="rounded-lg border border-border bg-card/50 px-3 py-3"
                >
                  <dt className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{DIM_LABELS[key]}</span>
                    <button
                      type="button"
                      onClick={() => handleEdit(key)}
                      disabled={isPending}
                      aria-label={`Edit ${DIM_LABELS[key]}`}
                      className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors"
                    >
                      <Pencil className="size-3" />
                    </button>
                  </dt>
                  <dd className="text-sm text-foreground">{renderDimValue(key)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              The whole picture
            </h2>
            <p className="text-sm text-foreground leading-relaxed">
              {document.synthesisParagraph || (
                <span className="text-muted-foreground">No synthesis written.</span>
              )}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              What this rules out
            </h2>
            <p className="text-sm text-foreground leading-relaxed">
              {document.rulesOut || (
                <span className="text-muted-foreground">No exclusions written.</span>
              )}
            </p>
          </section>

          {document.recommendedActions.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-foreground mb-3">
                Recommended actions
              </h2>
              <ul className="space-y-2">
                {document.recommendedActions.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-card/30 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span className={
                        a.severity === 'strongly_advised'
                          ? 'text-gold font-medium'
                          : 'text-muted-foreground'
                      }>
                        {a.severity === 'strongly_advised' ? 'Strongly advised' : 'Suggested'}
                      </span>
                      <span>·</span>
                      <span>{a.status}</span>
                    </div>
                    <div className="text-foreground">{a.action}</div>
                    {a.founderResponse && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        You said: {a.founderResponse}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actionError && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {actionError}
            </div>
          )}

          <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <OutcomeDocumentChat sessionId={sessionId} disabled />
            <Button
              variant="ghost"
              onClick={() => router.push('/discovery')}
              disabled={isPending}
            >
              Save and come back
            </Button>
            {status === 'output_ready' ? (
              <Button onClick={handleCommit} disabled={isPending} className="ml-auto">
                I&apos;m ready for Stage 2
                <ArrowRight className="size-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => router.refresh()}
                disabled={isPending}
                className="ml-auto"
              >
                Continue to Stage 2
                <ArrowRight className="size-4 ml-1" />
              </Button>
            )}
          </footer>

          <p className="mt-6 flex items-center gap-1 text-xs text-muted-foreground">
            <RotateCcw className="size-3" />
            <span>Editing a dimension reopens the conversation for that field only — you can discard and restore.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// Map raw enum values to human-readable labels for display. Aligned
// with the founder-facing copy approved 2026-05-11.
function labelFor(value: string): string {
  const map: Record<string, string> = {
    // timeHorizon
    '<6mo':              'Under 6 months',
    '6-18mo':            '6-18 months',
    '18mo-3yr':          '18 months to 3 years',
    '3yr+':              '3 years or more',
    'open':              'Open / no fixed horizon',
    // financialGoal shape
    'side_income':       'Side income',
    'full_replacement':  'Full salary replacement',
    'modest_growth':     'Modest growth',
    'wealth_creation':   'Wealth creation',
    'venture_scale':     'Venture scale',
    // riskTolerance
    'minimal':           'Minimal',
    'moderate':          'Moderate',
    'high':              'High',
    'all_in':            'All in',
    // lifestylePreference
    'side_hustle':       'Side hustle',
    'full_time_founder': 'Full-time founder',
    'lifestyle_business': 'Lifestyle business',
    'fundable_startup':  'Fundable startup',
    'contract_freelance': 'Contract / freelance',
  };
  return map[value] ?? value;
}

