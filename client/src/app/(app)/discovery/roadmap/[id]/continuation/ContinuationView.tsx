'use client';
// src/app/(app)/discovery/roadmap/[id]/continuation/ContinuationView.tsx

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import type {
  ContinuationBrief,
  ContinuationFork,
  DiagnosticHistory,
  ParkingLot,
} from '@/lib/continuation';
import { BriefSections } from './BriefSections';
import { ForkPicker } from './ForkPicker';

interface ContinuationData {
  continuationStatus: string | null;
  brief:              ContinuationBrief | null;
  diagnosticHistory:  DiagnosticHistory;
  parkingLot:         ParkingLot;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_DEADLINE_MS = 4 * 60 * 1000;

/**
 * ContinuationView
 *
 * Polls the continuation endpoint until BRIEF_READY (or already
 * FORK_SELECTED), then renders the five-section brief + fork
 * picker. The actual rendering work is split into BriefSections
 * (presentation) and ForkPicker (interactive selection) so this
 * orchestrator stays under the 200-line component cap.
 */
export function ContinuationView({ roadmapId }: { roadmapId: string }) {
  const router = useRouter();
  const [data, setData]       = useState<ContinuationData | null>(null);
  const [polling, setPolling] = useState(true);
  const [failed, setFailed]   = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/continuation`);
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const json = await res.json() as ContinuationData;
      setData(json);
      // Clear any prior failure flag — a transient network blip
      // followed by a successful poll should let the brief render,
      // not stay locked on the error surface forever.
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [roadmapId]);

  // Polling loop — runs while `polling` is true. Stops as soon as
  // the freshest snapshot has the brief or a terminal status. Two
  // separate effects keep concerns clean: this one schedules ticks
  // and writes to `data` via refetch; the second one watches `data`
  // for the stop condition and flips `polling` off. No setState
  // callbacks with side effects, no impurity in render — strict-mode
  // safe.
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + POLL_DEADLINE_MS;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() >= deadline) {
        setFailed(true);
        setPolling(false);
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
  }, [polling, refetch]);

  // Stop polling once the data has reached a terminal state. Pure
  // derivation — no schedule, no fetch, just a one-shot transition
  // from polling=true to polling=false.
  useEffect(() => {
    if (!polling) return;
    const status = data?.continuationStatus;
    if (status === 'BRIEF_READY' || status === 'FORK_SELECTED' || data?.brief) {
      setPolling(false);
    }
  }, [data, polling]);

  const handlePickFork = useCallback(async (fork: ContinuationFork) => {
    setPicking(fork.id);
    setPickError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/continuation/fork`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ forkId: fork.id }),
      });
      const json = await res.json() as {
        newRecommendationId?: string;
        error?:               string;
      };
      if (!res.ok) {
        setPickError(json.error ?? 'Could not select that fork.');
        return;
      }
      // Cycle close — the fork-pick route created a fork-derived
      // Recommendation and queued the next-cycle roadmap generation.
      // Navigate the founder to the new roadmap immediately; the
      // generation function fires asynchronously and the existing
      // RoadmapView polling shows the GENERATING state until READY.
      if (json.newRecommendationId) {
        router.push(`/discovery/roadmap/${json.newRecommendationId}`);
        return;
      }
      await refetch();
      router.refresh();
    } catch {
      setPickError('Network error — please try again.');
    } finally {
      setPicking(null);
    }
  }, [roadmapId, refetch, router]);

  if (polling && !data?.brief) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 className="size-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Reading your execution evidence…</p>
        <p className="text-xs text-muted-foreground/60">This takes about 30 seconds.</p>
      </div>
    );
  }

  if (failed || !data?.brief) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-sm text-muted-foreground">Could not load your continuation brief.</p>
        <p className="text-xs text-muted-foreground/60">Please return to the roadmap and try again.</p>
      </div>
    );
  }

  const isPicked = data.continuationStatus === 'FORK_SELECTED';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6 max-w-2xl mx-auto px-6 py-10"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">What&apos;s next</h1>
        <p className="text-sm text-muted-foreground">
          Built from your check-ins, blockers, and parking lot.
        </p>
      </div>

      <BriefSections brief={data.brief} />

      <ForkPicker
        forks={data.brief.forks}
        onPick={(fork) => { void handlePickFork(fork); }}
        picking={picking}
        error={pickError}
        isPicked={isPicked}
      />
    </motion.div>
  );
}
