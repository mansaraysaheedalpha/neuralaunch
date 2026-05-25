'use client';
// src/lib/ideation/stage5-handoff/use-stage5-job.ts
//
// Client-side polling hook for the Stage 5 synthesis job. Modeled
// after src/lib/tool-jobs/use-tool-job.ts (same SWR pattern, same
// 3s foreground / 30s backgrounded cadence, same visibility-driven
// throttle) but scoped to the Stage 5 status route shape.

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { z } from 'zod';

// Inlined to avoid importing server-only `./job`. Keep this in lock-step
// with STAGE5_JOB_STAGES / STAGE5_TERMINAL_STAGES in job.ts — the unit
// test in __tests__/use-stage5-job.test.ts pins both shapes.
const STAGE5_JOB_STAGES = [
  'queued',
  'loading_inputs',
  'synthesizing',
  'persisting',
  'succeeded',
  'failed',
] as const;
type Stage5JobStage = typeof STAGE5_JOB_STAGES[number];
const STAGE5_TERMINAL_STAGES: readonly Stage5JobStage[] = ['succeeded', 'failed'];

export type { Stage5JobStage };

const POLL_INTERVAL_FOREGROUND_MS   = 3_000;
const POLL_INTERVAL_BACKGROUNDED_MS = 30_000;

/**
 * Hard ceiling on polling. After this many milliseconds the hook
 * stops re-fetching even if the worker is still in a non-terminal
 * stage. Inngest retries are bounded server-side; this is the safety
 * net for a runaway worker.
 */
const POLL_HARD_STOP_MS = 6 * 60 * 1_000;

const Stage5StatusBodySchema = z.object({
  jobId:            z.string(),
  status:           z.enum(['queued', 'running', 'succeeded', 'failed']),
  stage:            z.enum(STAGE5_JOB_STAGES),
  error:            z.string().optional(),
  recommendationId: z.string().optional(),
});

export type Stage5StatusBody = z.infer<typeof Stage5StatusBodySchema>;

function isPastHardStop(startedAt: number | null): boolean {
  return startedAt !== null && Date.now() - startedAt >= POLL_HARD_STOP_MS;
}

const fetcher = async (url: string): Promise<Stage5StatusBody> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const json: unknown = await res.json();
  return Stage5StatusBodySchema.parse(json);
};

export interface UseStage5JobInput {
  /** SessionId — the status route is scoped by session. Null disables polling. */
  sessionId: string | null;
  /** Set to true once the founder has fired the synthesize POST. Null/false keeps polling off. */
  enabled:   boolean;
}

export interface UseStage5JobResult {
  job:        Stage5StatusBody | null;
  stage:      Stage5JobStage | null;
  isTerminal: boolean;
  isFailed:   boolean;
  error:      Error | null;
}

export function useStage5Job({ sessionId, enabled }: UseStage5JobInput): UseStage5JobResult {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState !== 'hidden';
  });
  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtRef.current = enabled && sessionId ? Date.now() : null;
  }, [enabled, sessionId]);

  const url = enabled && sessionId
    ? `/api/discovery/sessions/${sessionId}/stage5/status`
    : null;

  const { data, error } = useSWR<Stage5StatusBody, Error>(
    url,
    fetcher,
    {
      refreshInterval: () => {
        if (!url) return 0;
        if (isPastHardStop(startedAtRef.current)) return 0;
        if (data && (STAGE5_TERMINAL_STAGES as readonly string[]).includes(data.stage)) return 0;
        return isVisible ? POLL_INTERVAL_FOREGROUND_MS : POLL_INTERVAL_BACKGROUNDED_MS;
      },
      revalidateOnFocus:  false,
      shouldRetryOnError: false,
    },
  );

  return {
    job:        data ?? null,
    stage:      data?.stage ?? null,
    isTerminal: data ? (STAGE5_TERMINAL_STAGES as readonly string[]).includes(data.stage) : false,
    isFailed:   data?.stage === 'failed',
    error:      error instanceof Error ? error : null,
  };
}
