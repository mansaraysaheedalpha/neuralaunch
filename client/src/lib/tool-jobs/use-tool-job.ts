'use client';
// src/lib/tool-jobs/use-tool-job.ts
//
// Client-side polling hook for ToolJob status. Drives the
// step-progress ladder rendered by ToolJobProgress and the
// in-page "your work is ready" reveal logic on the tool pages.

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  ToolJobStatusSchema,
  TERMINAL_STAGES,
  type ToolJobStatus,
  type ToolJobStage,
} from './schemas';

const POLL_INTERVAL_FOREGROUND_MS = 3_000;
const POLL_INTERVAL_BACKGROUNDED_MS = 30_000;

/**
 * Hard ceiling on polling. After this many milliseconds the hook
 * stops re-fetching even if the job is still in a non-terminal
 * stage. Inngest retries are bounded server-side; the cap is a
 * safety net for genuinely runaway jobs.
 */
const POLL_HARD_STOP_MS = 6 * 60 * 1_000;

// Impure-time check kept outside the component so the React 19 purity
// lint doesn't flag `Date.now()` as called during render. SWR's
// refreshInterval callback fires from a timer, but the rule reads the
// AST not the call site, so we move the impurity behind a normal
// function call instead.
function isPastHardStop(startedAt: number | null): boolean {
  return startedAt !== null && Date.now() - startedAt >= POLL_HARD_STOP_MS;
}

const fetcher = async (url: string): Promise<ToolJobStatus> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const json: unknown = await res.json();
  return ToolJobStatusSchema.parse(json);
};

export interface UseToolJobInput {
  /** Job id, or null to disable polling entirely. */
  jobId:     string | null;
  /** Roadmap that owns the job (used to scope the status URL). */
  roadmapId: string | null;
}

export interface UseToolJobResult {
  job:        ToolJobStatus | null;
  stage:      ToolJobStage | null;
  isTerminal: boolean;
  isFailed:   boolean;
  error:      Error | null;
}

export function useToolJob({ jobId, roadmapId }: UseToolJobInput): UseToolJobResult {
  // Track tab visibility so we can ease off polling when backgrounded.
  // Cuts API load roughly 10x while still responding fast when the
  // founder returns to the tab.
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState !== 'hidden';
  });
  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Hard stop after POLL_HARD_STOP_MS regardless of stage. Safety net
  // for the rare case that an Inngest function dies without flipping
  // the row to 'failed'. Uses a ref + the refreshInterval callback —
  // no state means no extra renders and no React 19 lint warnings
  // about synchronous setState inside an effect.
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtRef.current = jobId ? Date.now() : null;
  }, [jobId]);

  const url = jobId && roadmapId
    ? `/api/discovery/roadmaps/${roadmapId}/tool-jobs/${jobId}/status`
    : null;

  const { data, error } = useSWR<ToolJobStatus, Error>(
    url,
    fetcher,
    {
      // Per-call refresh interval. SWR re-evaluates on every render so
      // visibility flips take effect on the next tick. Returning 0
      // disables polling on terminal stages and after the hard stop.
      refreshInterval: () => {
        if (!url) return 0;
        if (isPastHardStop(startedAtRef.current)) return 0;
        if (data && (TERMINAL_STAGES as readonly string[]).includes(data.stage)) return 0;
        return isVisible ? POLL_INTERVAL_FOREGROUND_MS : POLL_INTERVAL_BACKGROUNDED_MS;
      },
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  return {
    job:        data ?? null,
    stage:      data?.stage ?? null,
    isTerminal: data ? (TERMINAL_STAGES as readonly string[]).includes(data.stage) : false,
    isFailed:   data?.stage === 'failed',
    error:      error instanceof Error ? error : null,
  };
}
