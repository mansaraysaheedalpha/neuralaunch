'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
// Specific-path imports keep the lib/ideation barrel (which
// re-exports server-only modules) out of this client bundle.
import type {
  RequirementsDocument,
  ExpectedProfileEntry,
} from '@/lib/ideation/stage2-requirements/schema';
import type {
  ExpectedProfilePushbackAction,
  StructuralBlockerChoice,
} from '@neuralaunch/constants';
import { ExpectedProfileView } from './ExpectedProfileView';
import { ConstraintsList } from './ConstraintsList';
import { StructuralBlockerCard } from './StructuralBlockerCard';
import { RecommendedActionsSection } from './RecommendedActionsSection';

interface RequirementsDocumentViewProps {
  stageRunId: string;
  sessionId:  string;
  status:     'output_ready' | 'committed';
  document:   RequirementsDocument;
  /** True when an upstream Stage 1 edit invalidated derivation. */
  requiresRederivation?: boolean;
}

/**
 * Review-mode renderer composing all four sections of a
 * RequirementsDocument: Skill Inventory snapshot summary, Expected
 * Profile (with pushback drawer per entry), Constraints, Structural
 * Blocker, Recommended Actions.
 *
 * Founder affordances:
 *   - Question this (per Expected Profile entry) — opens pushback drawer
 *   - Choose a structural-blocker path (when triggered)
 *   - Re-derive (when requiresRederivation is true)
 *   - I'm ready for Stage 3 — commit + navigate
 *
 * Edit-the-canvas affordances live on the chat surface, not here.
 */
export function RequirementsDocumentView({
  stageRunId,
  sessionId,
  status,
  document,
  requiresRederivation = false,
}: RequirementsDocumentViewProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const readOnly = status === 'committed';

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

  const handleRederive = () => {
    startTransition(async () => {
      setActionError(null);
      const res = await fetch(`/api/ideation/stage-runs/${stageRunId}/derive-expected-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setActionError(data.error ?? `Could not re-derive (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  const handleStructuralBlockerChoose = async (
    choice: StructuralBlockerChoice,
    notes:  string | null,
  ) => {
    const res = await fetch(`/api/ideation/stage-runs/${stageRunId}/structural-blocker-choice`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ choice, notes }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `Could not save choice (HTTP ${res.status})`);
    }
    router.refresh();
  };

  const handlePushback = async (args: {
    entryIndex:   number;
    message:      string;
    priorVersion: number;
  }) => {
    const res = await fetch(`/api/ideation/stage-runs/${stageRunId}/expected-profile-pushback`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(args),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `Pushback round failed (HTTP ${res.status})`);
    }
    const data = await res.json() as {
      action:  ExpectedProfilePushbackAction;
      message: string;
      entry:   ExpectedProfileEntry;
      version: number;
      status:  'open' | 'closed';
    };
    // Refresh so the page re-fetches the entry list with the
    // updated pushback state.
    router.refresh();
    return data;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <header>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {status === 'committed' ? 'Committed' : 'Pre-commit review'} · Sessions
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              Your requirements — Stage 2 of 5
            </h1>
          </header>

          {requiresRederivation && (
            <div className="rounded-lg border border-gold/40 bg-gold/5 px-4 py-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Stage 1 was updated</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Your Skill Inventory is preserved, but the Expected Profile and Constraints below are derived against the prior Outcome Document. Re-derive to align them with what you just committed.
                </p>
              </div>
              <Button onClick={handleRederive} disabled={busy} size="sm">
                <RotateCcw className="size-3 mr-1" />
                Re-derive
              </Button>
            </div>
          )}

          <section>
            <h2 className="text-sm font-semibold text-foreground mb-3">
              The expected profile
            </h2>
            <ExpectedProfileView
              entries={document.expectedProfile}
              readOnly={readOnly}
              onPushback={handlePushback}
            />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Constraints
            </h2>
            <ConstraintsList constraints={document.constraints} />
          </section>

          <StructuralBlockerCard
            blocker={document.structuralBlocker}
            readOnly={readOnly}
            onChoose={handleStructuralBlockerChoose}
          />

          <RecommendedActionsSection actions={document.recommendedActions} />

          {actionError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {actionError}
            </div>
          )}

          <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/discovery')}
              disabled={busy}
            >
              Save and come back
            </Button>
            {status === 'output_ready' ? (
              <Button onClick={handleCommit} disabled={busy} className="ml-auto">
                I&apos;m ready for Stage 3
                <ArrowRight className="size-4 ml-1" />
              </Button>
            ) : (
              <span className="ml-auto text-sm text-muted-foreground">Committed · Stage 3 coming soon</span>
            )}
          </footer>

          {/* Hidden: sessionId is read by future ask-chat affordance.
              Suppress unused-prop warning. */}
          <span className="hidden" data-session-id={sessionId} />
        </div>
      </div>
    </div>
  );
}
