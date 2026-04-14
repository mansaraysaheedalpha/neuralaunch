// src/hooks/useContinuation.ts
//
// Fetches continuation data for a roadmap — the diagnostic, the
// brief, and the forks. Polls while the brief is generating.

import { useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/services/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContinuationFork {
  id:          string;
  title:       string;
  summary:     string;
  reasoning:   string;
  whyThisOne:  string;
}

export interface ParkingLotEntry {
  id:       string;
  idea:     string;
  source:   string;
  capturedAt: string;
}

export interface ContinuationBrief {
  closingReflection: string;
  forks:             ContinuationFork[];
  parkingLot?:       ParkingLotEntry[];
  generatedAt:       string;
}

export interface ContinuationData {
  status:          'NOT_STARTED' | 'GENERATING' | 'READY' | 'FAILED';
  brief:           ContinuationBrief | null;
  canContinue:     boolean;
  blockReason?:    string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

async function fetchContinuation(url: string): Promise<ContinuationData> {
  return api<ContinuationData>(url);
}

export function useContinuation(roadmapId: string | null) {
  const { data, isLoading, error, mutate } = useSWR(
    roadmapId
      ? `/api/discovery/roadmaps/${roadmapId}/continuation`
      : null,
    fetchContinuation,
    { revalidateOnFocus: true, dedupingInterval: 3000 },
  );

  const isGenerating = data?.status === 'GENERATING';

  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => { void mutate(); }, 3000);
    return () => clearInterval(timer);
  }, [isGenerating, mutate]);

  return {
    data,
    isLoading,
    isGenerating,
    error,
    refresh: mutate,
  };
}
