'use client';
// src/lib/tool-jobs/use-active-jobs.ts
//
// Client-side hook that polls /api/discovery/tool-jobs/active so the
// global background-jobs banner can surface in-flight work from any
// page in the app — not just the tool page that started it.
//
// Polling cadence: 10s in foreground, 60s when backgrounded. The
// per-job hook (use-tool-job) polls more aggressively (3s/30s)
// because that one drives the step-progress ladder; this one only
// needs to know the count of active jobs.

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  ToolJobStatusSchema,
  type ToolJobStatus,
} from './schemas';

const POLL_INTERVAL_FOREGROUND_MS = 10_000;
const POLL_INTERVAL_BACKGROUNDED_MS = 60_000;

export interface ActiveToolJob extends ToolJobStatus {
  /** Roadmap the job belongs to — used by the banner to link back. */
  roadmapId: string;
}

const fetcher = async (url: string): Promise<ActiveToolJob[]> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const json = await res.json() as { jobs: unknown[] };
  // Validate each row against the canonical schema; drop malformed
  // entries silently rather than throw — a single bad row shouldn't
  // hide the banner for legitimate jobs.
  const out: ActiveToolJob[] = [];
  for (const raw of json.jobs ?? []) {
    if (typeof raw !== 'object' || raw === null) continue;
    const obj = raw as Record<string, unknown>;
    const parsed = ToolJobStatusSchema.safeParse(obj);
    if (!parsed.success) continue;
    if (typeof obj['roadmapId'] !== 'string') continue;
    out.push({ ...parsed.data, roadmapId: obj['roadmapId'] });
  }
  return out;
};

export interface UseActiveJobsResult {
  jobs:    ActiveToolJob[];
  loading: boolean;
}

export function useActiveJobs(): UseActiveJobsResult {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState !== 'hidden';
  });
  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const { data, isLoading } = useSWR<ActiveToolJob[]>(
    '/api/discovery/tool-jobs/active',
    fetcher,
    {
      refreshInterval: () => (isVisible ? POLL_INTERVAL_FOREGROUND_MS : POLL_INTERVAL_BACKGROUNDED_MS),
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );

  return {
    jobs:    data ?? [],
    loading: isLoading,
  };
}
