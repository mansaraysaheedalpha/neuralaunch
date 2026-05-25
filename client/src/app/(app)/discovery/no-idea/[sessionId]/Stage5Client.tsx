'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage5Client.tsx
//
// Orchestrates the Stage 5 founder surface: the primary "Generate
// handoff" CTA, the polling client that drives the in-flight progress
// checklist, and the failure/success transitions.
//
// Copy locked in docs/stage5-copy-review.md §§ A.6, A.7, B, C, D.
//
// The pre-synthesis static panels (banner, chosen, reserves, cascade
// banner) are server-rendered above this component by Stage5Page; we
// only own the CTA + dynamic transitions here.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStage5Job } from '@/lib/ideation/stage5-handoff/use-stage5-job';
import { Stage5InFlight } from './Stage5InFlight';
import { Stage5Failure } from './Stage5Failure';
import { Stage5Success } from './Stage5Success';

interface Stage5ClientProps {
  sessionId:        string;
  /** Set when an in-flight or terminal job already exists for this session. */
  initialJobId:     string | null;
  /** Set when the founder has previously fired synthesis but it failed. */
  initialFailureMessage: string | null;
  /** True when the cascade banner already disabled the CTA (defence-in-depth). */
  cascadeStale:     boolean;
}

export function Stage5Client({
  sessionId,
  initialJobId,
  initialFailureMessage,
  cascadeStale,
}: Stage5ClientProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [acceptError, setAcceptError] = useState<string | null>(null);
  // Tracks whether we've fired the POST locally this session — flips
  // polling on. Initial value true when a job already existed when the
  // page was server-rendered.
  const [pollingEnabled, setPollingEnabled] = useState<boolean>(initialJobId !== null);
  // Tracks a transient retry state so the "Try again" CTA can show
  // a spinner while the POST is in flight.
  const [retrying, setRetrying] = useState<boolean>(false);

  const { job, stage, isFailed, isTerminal } = useStage5Job({
    sessionId,
    enabled: pollingEnabled,
  });

  // Fire-and-forget POST to the synthesize route. Returns true on 202.
  async function fireSynthesisPost(): Promise<boolean> {
    setAcceptError(null);
    const res = await fetch(`/api/discovery/sessions/${sessionId}/stage5/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    });
    if (res.status === 202) {
      setPollingEnabled(true);
      return true;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setAcceptError(data.error ?? `Couldn’t start synthesis (HTTP ${res.status}).`);
    return false;
  }

  function handleFire() {
    startTransition(async () => {
      await fireSynthesisPost();
    });
  }

  function handleRetry() {
    setRetrying(true);
    void (async () => {
      await fireSynthesisPost();
      setRetrying(false);
    })();
  }

  function handleRevisitStage4() {
    // No new route — the dispatcher renders Stage 4 automatically once
    // the founder edits the committed Stage 4 row (which the revisit
    // surface owns). For now we route back into the dispatcher; the
    // dispatcher decides the right surface from the active stage.
    router.push(`/discovery/no-idea/${sessionId}`);
  }

  // ── Success — instant redirect ───────────────────────────────────
  if (stage === 'succeeded' && job?.recommendationId) {
    return (
      <Stage5Success
        sessionId={sessionId}
        recommendationId={job.recommendationId}
      />
    );
  }

  // ── Failure — error surface ──────────────────────────────────────
  if (isFailed && job) {
    return (
      <Stage5Failure
        errorMessage={job.error ?? initialFailureMessage ?? 'Unknown error'}
        onRetry={handleRetry}
        onRevisitStage4={handleRevisitStage4}
        retrying={retrying}
      />
    );
  }

  // ── In-flight — polling client ───────────────────────────────────
  // Show the progress checklist as soon as polling is enabled, even
  // before the first poll lands (default to 'queued').
  if (pollingEnabled && !isTerminal) {
    return <Stage5InFlight stage={stage ?? 'queued'} />;
  }

  // ── Pre-synthesis CTA + secondary action (A.6 + A.7) ─────────────
  const ctaDisabled = busy || cascadeStale;

  return (
    <div className="space-y-3">
      {initialFailureMessage && !pollingEnabled && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Last attempt: {initialFailureMessage}
        </div>
      )}
      {acceptError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {acceptError}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button
          variant="ghost"
          onClick={handleRevisitStage4}
          disabled={busy}
          title="Reopens Stage 4 for edits. The handoff hasn't fired yet — nothing to discard."
        >
          Revisit Stage 4
        </Button>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Button onClick={handleFire} disabled={ctaDisabled}>
            {busy ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                Generate handoff
                <ArrowRight className="size-4 ml-1" />
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground max-w-xs text-right">
            Synthesis takes ~1 minute. I&apos;ll combine your Stage 1-4 evidence into a single recommendation, then take you to the review surface.
          </p>
        </div>
      </div>
    </div>
  );
}
