'use client';
// src/components/sidebar/useHasValidationPages.ts
//
// Lightweight SWR hook checking whether the authenticated user has at
// least one ValidationPage. Used by the sidebar to conditionally render
// the "Validation pages" link — the link only makes sense once a page
// exists; before that it leads to an empty list and clutters the nav.
// Mirrors the useHasRoadmap shape exactly.

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useHasValidationPages(enabled: boolean) {
  const { data, isLoading } = useSWR<{ hasValidationPage: boolean }>(
    enabled ? '/api/discovery/validation/has-any' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  return {
    hasValidationPage: data?.hasValidationPage ?? false,
    loading:           isLoading,
  };
}
