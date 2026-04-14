// src/hooks/useRecommendation.ts
//
// Fetches a single recommendation by ID with SWR. Includes the
// pushback history, acceptance state, alternative link, roadmap
// status, and validation page info — everything the recommendation
// screen needs to render the full experience.

import useSWR from 'swr';
import { api } from '@/services/api-client';

// ---------------------------------------------------------------------------
// Types — mirror the web app's Recommendation + relations
// ---------------------------------------------------------------------------

export interface RiskRow {
  risk:       string;
  mitigation: string;
}

export interface AlternativeRejected {
  alternative:   string;
  whyNotForThem: string;
}

export interface PushbackTurn {
  role:        'user' | 'agent';
  content:     string;
  round:       number;
  mode?:       string;
  action?:     string;
  converging?: boolean;
  timestamp:   string;
}

export interface RecommendationData {
  id:                          string;
  recommendationType:          string | null;
  summary:                     string;
  path:                        string;
  reasoning:                   string;
  firstThreeSteps:             string[];
  timeToFirstResult:           string;
  risks:                       RiskRow[];
  assumptions:                 string[];
  whatWouldMakeThisWrong:      string;
  alternativeRejected:         AlternativeRejected;
  acceptedAt:                  string | null;
  pushbackHistory:             PushbackTurn[];
  alternativeRecommendationId: string | null;
  roadmapReady:                boolean;
  roadmapId:                   string | null;
  validationPageId:            string | null;
  validationSignalStrength:    string | null;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchRecommendation(url: string): Promise<RecommendationData> {
  return api<RecommendationData>(url);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRecommendation(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/discovery/recommendations/${id}` : null,
    fetchRecommendation,
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  );

  return {
    recommendation: data ?? null,
    isLoading,
    error,
    refresh: mutate,
  };
}
