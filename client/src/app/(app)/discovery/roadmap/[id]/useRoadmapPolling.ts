'use client';
// src/app/(app)/discovery/roadmap/[id]/useRoadmapPolling.ts

import { useCallback, useEffect, useState } from 'react';
import type { RoadmapPhase } from '@/lib/roadmap';
import type { ParkingLotItem } from '@/lib/continuation';

export interface RoadmapProgressData {
  totalTasks:     number;
  completedTasks: number;
  blockedTasks:   number;
  lastActivityAt: string;
  nudgePending:   boolean;
  /**
   * A11: the exact title of the in-progress task the nudge cron
   * flagged. Null on legacy rows flagged before this column existed.
   * The NudgeBanner falls back to walking the phases when null.
   */
  staleTaskTitle: string | null;
  /** Concern 5 trigger #2 — set by the daily nudge sweep. */
  outcomePromptPending?: boolean;
}

export interface RoadmapData {
  id:             string;
  status:         'GENERATING' | 'READY' | 'FAILED' | 'STALE';
  phases:         RoadmapPhase[];
  closingThought: string | null;
  weeklyHours:    number | null;
  totalWeeks:     number | null;
  progress:       RoadmapProgressData | null;
  /** Roadmap continuation — see lib/continuation. */
  parkingLot:         ParkingLotItem[];
  continuationStatus: string | null;
}

type PollResponse = { status: 'not_started' } | RoadmapData;

interface RoadmapPollingState {
  data:         RoadmapData | null;
  loading:      boolean;
  failed:       boolean;
  regenerating: boolean;
}

export interface RoadmapPollingResult extends RoadmapPollingState {
  /** Trigger a fresh POST + re-poll. Used by the STALE banner. */
  regenerate: () => Promise<void>;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_DEADLINE_MS = 3 * 60 * 1000;

/**
 * useRoadmapPolling
 *
 * Polls the roadmap endpoint every POLL_INTERVAL_MS while the roadmap
 * is GENERATING, then settles into the READY or STALE state. Exposes
 * a regenerate() callback that POSTs the route to flip the row back
 * to GENERATING and re-runs the polling loop without remounting.
 *
 * Single source of polling logic for the roadmap viewer — extracted
 * out of RoadmapView so that file stays under the 200-line cap.
 */
export function useRoadmapPolling(recommendationId: string): RoadmapPollingResult {
  const [data, setData]                 = useState<RoadmapData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [failed, setFailed]             = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Bumped by regenerate() to re-run the polling effect without remounting.
  const [pollEpoch, setPollEpoch]       = useState(0);

  useEffect(() => {
    let pollTimeout: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + POLL_DEADLINE_MS;
    let cancelled  = false;

    async function poll() {
      if (cancelled) return;
      if (Date.now() >= deadline) {
        setFailed(true);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/discovery/recommendations/${recommendationId}/roadmap`);
        if (!res.ok) {
          setFailed(true);
          setLoading(false);
          return;
        }
        const json = await res.json() as PollResponse;

        if (json.status === 'not_started' || json.status === 'GENERATING') {
          pollTimeout = setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
        } else if (json.status === 'READY' || json.status === 'STALE') {
          // STALE roadmaps are still rendered — the founder can read
          // them — but the banner offers regeneration. The data is
          // structurally identical to READY.
          setData(json);
          setLoading(false);
        } else {
          // FAILED or unknown
          setFailed(true);
          setLoading(false);
        }
      } catch {
        setFailed(true);
        setLoading(false);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(pollTimeout);
    };
  }, [recommendationId, pollEpoch]);

  const regenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/discovery/recommendations/${recommendationId}/roadmap`, {
        method: 'POST',
      });
      if (!res.ok) return;
      // Reset to loading state and bump the epoch — the polling effect
      // re-runs as a clean loop because pollEpoch is in its dep list.
      setData(null);
      setLoading(true);
      setFailed(false);
      setPollEpoch(e => e + 1);
    } finally {
      setRegenerating(false);
    }
  }, [recommendationId]);

  return { data, loading, failed, regenerating, regenerate };
}
