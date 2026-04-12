'use client';
// src/components/sidebar/useHasRoadmap.ts
//
// Lightweight SWR hook that checks whether the authenticated user
// has at least one roadmap. Used by the sidebar to conditionally
// render the "Tools" section — tools require a completed discovery
// session with a recommendation and roadmap because their entire
// value is context-awareness.

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

/**
 * Returns { hasRoadmap: boolean, loading: boolean }.
 * Only fetches when `enabled` is true (i.e. the user is authenticated).
 * The endpoint is a simple GET that returns { hasRoadmap: boolean }.
 */
export function useHasRoadmap(enabled: boolean) {
  const { data, isLoading } = useSWR<{ hasRoadmap: boolean }>(
    enabled ? '/api/discovery/roadmaps/has-any' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  return {
    hasRoadmap: data?.hasRoadmap ?? false,
    loading:    isLoading,
  };
}
