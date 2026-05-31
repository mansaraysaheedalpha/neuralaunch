'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage5Client.tsx
//
// Stage 5 synthesis orchestration in the Institute treatment.
// Composes:
//   - <SynthesisCommit> for the "moment" CTA band (replaces the prior
//     plain primary button).
//   - <SynthesisOverlay> for the in-flight job (replaces Stage5InFlight).
//     Stages reduced from the 6-state Stage5JobStage enum to the
//     reference's 5 display steps; the overlay walks them as the
//     poll updates.
//   - Stage5Success (kept unchanged) — terminal redirect via
//     router.replace to /discovery/recommendations/[id].
//   - Stage5Failure (kept unchanged) — terminal error surface with
//     retry + revisit-Stage-4 affordances.
//
// Transport unchanged: POST /api/discovery/sessions/[id]/stage5/synthesize
// fires the job, useStage5Job polls /stage5/status until terminal.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SynthesisOverlay, type SynthesisStep } from '@/components/institute';
import { SynthesisCommit } from '@/components/institute/no-idea';
import { useStage5Job, type Stage5JobStage } from '@/lib/ideation/stage5-handoff/use-stage5-job';
import { Stage5Failure } from './Stage5Failure';
import { Stage5Success } from './Stage5Success';

interface Stage5ClientProps {
  sessionId:             string;
  initialJobId:          string | null;
  initialFailureMessage: string | null;
  cascadeStale:          boolean;
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
  const [pollingEnabled, setPollingEnabled] = useState<boolean>(initialJobId !== null);
  const [retrying, setRetrying] = useState<boolean>(false);

  const { job, stage, isFailed, isTerminal } = useStage5Job({ sessionId, enabled: pollingEnabled });

  async function fireSynthesisPost(): Promise<boolean> {
    setAcceptError(null);
    const res = await fetch(`/api/discovery/sessions/${sessionId}/stage5/synthesize`, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    });
    if (res.status === 202) {
      setPollingEnabled(true);
      return true;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setAcceptError(data.error ?? `Couldn't start synthesis (HTTP ${res.status}).`);
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

  // ── Failure — error surface (kept as legacy palette; flag) ───────
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

  // ── In-flight — full-page Institute overlay ──────────────────────
  if (pollingEnabled && !isTerminal) {
    return (
      <div className="fixed inset-0 z-50" style={{ background: 'color-mix(in oklab, var(--bg) 96%, transparent)' }}>
        <SynthesisOverlay
          open
          stamp="Synthesising · Stage V · Opus 4.6 → Sonnet"
          heading={<>Reading you back to <em>yourself.</em></>}
          body="One direction, for your specific situation — ready in about ninety seconds."
          steps={buildStage5Steps(stage ?? 'queued')}
        />
      </div>
    );
  }

  // ── Pre-synthesis — the "moment" band ────────────────────────────
  return (
    <SynthesisCommit
      onCommit={handleFire}
      onEditVerdicts={handleRevisitStage4}
      busy={busy}
      disabled={cascadeStale}
      error={acceptError ?? (pollingEnabled ? null : initialFailureMessage)}
    />
  );
}

/**
 * Map the 6-state Stage5JobStage enum onto the reference's 5 display
 * steps. The synthetic "Alternatives · narrowing" step is folded into
 * the inputs-loading transition so the founder sees a five-step
 * checklist that matches the audit's "the moment" reading.
 */
function buildStage5Steps(stage: Stage5JobStage): SynthesisStep[] {
  // Numeric position on the worker timeline. Used to compute each
  // display step's state by comparing against thresholds.
  const pos: Record<Stage5JobStage, number> = {
    queued:         0,
    loading_inputs: 1,
    synthesizing:   2,
    persisting:     3,
    succeeded:      4,
    failed:         4,
  };
  const p = pos[stage];
  const stateAt = (threshold: number): SynthesisStep['state'] =>
    p > threshold ? 'done' : p === threshold ? 'active' : 'pending';
  return [
    { label: 'Loading inputs · belief state + skill matrix', state: stateAt(1) },
    { label: 'Alternatives · narrowing',                     state: p >= 2 ? 'done' : p === 1 ? 'active' : 'pending' },
    { label: 'Phase 1A · Opus reasoning',                    state: stateAt(2) },
    { label: 'Phase 1B · Sonnet emission',                   state: stateAt(3) },
    { label: 'Recommendation · written',                     state: stateAt(4) },
  ];
}
