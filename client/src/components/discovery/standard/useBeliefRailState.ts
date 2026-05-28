'use client';
// src/components/discovery/standard/useBeliefRailState.ts
//
// Fetches the persisted belief state for the standard discovery rail.
// Layered ON TOP of useDiscoverySession (which stays untouched) — it
// keys off the sessionId the hook now surfaces and a refetch signal
// (the question count) so it re-reads after each turn completes.

import useSWR from 'swr';
import type { BeliefStateResponse } from '@/app/api/discovery/sessions/[sessionId]/belief/route';

const fetcher = async (url: string): Promise<BeliefStateResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`belief fetch failed: ${res.status}`);
  return (await res.json()) as BeliefStateResponse;
};

export interface UseBeliefRailStateResult {
  belief:    BeliefStateResponse | null;
  isLoading: boolean;
}

/**
 * @param sessionId  null until the founder's first message creates the
 *                   session; the fetch is skipped while null.
 * @param refetchKey bump this (e.g. with the question count) to force a
 *                   re-read after a turn completes.
 */
export function useBeliefRailState(
  sessionId: string | null,
  refetchKey: number,
): UseBeliefRailStateResult {
  // The key embeds refetchKey so a question-count change triggers SWR
  // revalidation without manual mutate() plumbing. The URL itself
  // ignores the query param server-side.
  const key = sessionId
    ? `/api/discovery/sessions/${sessionId}/belief?t=${refetchKey}`
    : null;

  const { data, isLoading } = useSWR<BeliefStateResponse, Error>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData:  true,
  });

  return {
    belief:    data ?? null,
    isLoading: isLoading && !!sessionId,
  };
}
