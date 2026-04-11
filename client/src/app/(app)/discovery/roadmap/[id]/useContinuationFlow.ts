'use client';
// src/app/(app)/discovery/roadmap/[id]/useContinuationFlow.ts

import { useCallback, useEffect, useState } from 'react';
import type {
  ContinuationBrief,
  DiagnosticHistory,
  DiagnosticHistoryEntry,
  ParkingLot,
} from '@/lib/continuation';

/**
 * Possible client-side phases of the "What's Next?" flow.
 *
 * idle             — button visible, no checkpoint in flight
 * checking         — POST /checkpoint in flight, button shows spinner
 * diagnostic_open  — Scenario A or B; chat surface visible
 * brief_polling    — POST /checkpoint returned C/D OR diagnostic
 *                    released to brief; we are waiting for the
 *                    Inngest worker to persist the brief
 * brief_ready      — brief is on the row; navigate the founder
 *                    to the continuation reveal page
 * fork_selected    — terminal state for this hook; the next-cycle
 *                    roadmap is the founder's new home
 * error            — last network call failed; the button restores
 *                    to idle on retry
 */
export type ContinuationPhase =
  | 'idle'
  | 'checking'
  | 'diagnostic_open'
  | 'brief_polling'
  | 'brief_ready'
  | 'fork_selected'
  | 'error';

export interface ContinuationFlowState {
  phase:             ContinuationPhase;
  scenario:          'A' | 'B' | 'C' | 'D' | null;
  diagnosticHistory: DiagnosticHistory;
  brief:             ContinuationBrief | null;
  parkingLot:        ParkingLot;
  error:             string | null;
  /** True while a chat turn POST or fork POST is in flight. */
  submitting:        boolean;
}

export interface ContinuationFlowResult extends ContinuationFlowState {
  /** Fired by the "What's Next?" button. */
  startCheckpoint:    () => Promise<void>;
  /** Submit one diagnostic message. Only valid in diagnostic_open. */
  submitDiagnostic:   (message: string) => Promise<void>;
  /** Reset the hook's local state — used when the founder closes the chat. */
  reset:              () => void;
  /** Refetch the continuation row from the server. */
  refetch:            () => Promise<void>;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_DEADLINE_MS = 4 * 60 * 1000;

/**
 * useContinuationFlow
 *
 * Owns the entire client side of the continuation feature for one
 * roadmap. The hook is mounted by the RoadmapView and survives the
 * full checkpoint → diagnostic → polling → brief lifecycle without
 * navigation. The continuation reveal PAGE is a separate route that
 * reads the same continuation row from the server, so this hook
 * does NOT have to render the brief itself — it just needs to know
 * when to navigate.
 */
export function useContinuationFlow(roadmapId: string): ContinuationFlowResult {
  const [state, setState] = useState<ContinuationFlowState>({
    phase:             'idle',
    scenario:          null,
    diagnosticHistory: [],
    brief:             null,
    parkingLot:        [],
    error:             null,
    submitting:        false,
  });

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/continuation`);
      if (!res.ok) return;
      const json = await res.json() as {
        continuationStatus: string | null;
        brief:              ContinuationBrief | null;
        diagnosticHistory:  DiagnosticHistory;
        parkingLot:         ParkingLot;
      };
      setState(prev => ({
        ...prev,
        diagnosticHistory: json.diagnosticHistory,
        brief:             json.brief,
        parkingLot:        json.parkingLot,
        phase:
          json.continuationStatus === 'BRIEF_READY' ? 'brief_ready' :
          json.continuationStatus === 'FORK_SELECTED' ? 'fork_selected' :
          json.continuationStatus === 'GENERATING_BRIEF' ? 'brief_polling' :
          json.continuationStatus === 'DIAGNOSING' ? 'diagnostic_open' :
          prev.phase,
      }));
    } catch {
      // Polling failures are surfaced via the deadline timeout.
    }
  }, [roadmapId]);

  // Polling effect — runs whenever phase enters brief_polling.
  // Uses a cancelled flag (closure-scoped) for clean teardown. The
  // refetch call updates state via setState; when the resulting state
  // change flips phase out of 'brief_polling', the effect re-runs,
  // the cleanup sets cancelled = true, and the in-flight tick exits
  // before scheduling the next iteration. No setState side effects,
  // no epoch ref — strict-mode safe.
  useEffect(() => {
    if (state.phase !== 'brief_polling') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + POLL_DEADLINE_MS;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() >= deadline) {
        setState(prev =>
          prev.phase === 'brief_polling'
            ? { ...prev, phase: 'error', error: 'Brief generation timed out. Please try again.' }
            : prev,
        );
        return;
      }
      await refetch();
      if (cancelled) return;
      timer = setTimeout(() => { void tick(); }, POLL_INTERVAL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state.phase, refetch]);

  const startCheckpoint = useCallback(async () => {
    setState(prev => ({ ...prev, phase: 'checking', error: null }));
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json() as {
        scenario?:        'A' | 'B' | 'C' | 'D';
        status?:          string;
        explanation?:     string;
        error?:           string;
      };
      if (!res.ok) {
        setState(prev => ({ ...prev, phase: 'error', error: json.error ?? 'Checkpoint failed' }));
        return;
      }
      // Refetch immediately so we have the latest history + any
      // already-persisted brief from a prior cycle.
      await refetch();
      setState(prev => ({
        ...prev,
        scenario: json.scenario ?? null,
        phase:
          json.status === 'DIAGNOSING'        ? 'diagnostic_open' :
          json.status === 'GENERATING_BRIEF'  ? 'brief_polling'   :
          'idle',
      }));
    } catch (err) {
      setState(prev => ({ ...prev, phase: 'error', error: err instanceof Error ? err.message : 'Network error' }));
    }
  }, [roadmapId, refetch]);

  const submitDiagnostic = useCallback(async (message: string) => {
    setState(prev => ({ ...prev, submitting: true, error: null }));
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/diagnostic`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message }),
      });
      const json = await res.json() as {
        agent?:           DiagnosticHistoryEntry;
        releasedToBrief?: boolean;
        skippedToBrief?:  boolean;
        error?:           string;
      };
      if (!res.ok) {
        setState(prev => ({ ...prev, submitting: false, error: json.error ?? 'Diagnostic submit failed' }));
        return;
      }
      if (json.skippedToBrief || json.releasedToBrief) {
        setState(prev => ({ ...prev, submitting: false, phase: 'brief_polling' }));
        return;
      }
      // Append the founder + agent turn pair from the local optimistic
      // shape. The agent turn comes back from the server; the founder
      // turn we synthesise locally so the transcript renders without
      // a refetch round-trip.
      const founderTurn: DiagnosticHistoryEntry = {
        id:        `dx_local_${Date.now()}`,
        timestamp: new Date().toISOString(),
        role:      'founder',
        message,
      };
      setState(prev => ({
        ...prev,
        submitting:        false,
        diagnosticHistory: json.agent
          ? [...prev.diagnosticHistory, founderTurn, json.agent]
          : prev.diagnosticHistory,
      }));
    } catch (err) {
      setState(prev => ({ ...prev, submitting: false, error: err instanceof Error ? err.message : 'Network error' }));
    }
  }, [roadmapId]);

  const reset = useCallback(() => {
    setState({
      phase:             'idle',
      scenario:          null,
      diagnosticHistory: [],
      brief:             null,
      parkingLot:        [],
      error:             null,
      submitting:        false,
    });
  }, []);

  return {
    ...state,
    startCheckpoint,
    submitDiagnostic,
    reset,
    refetch,
  };
}
