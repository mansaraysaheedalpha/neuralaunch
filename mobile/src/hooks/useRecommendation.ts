// src/hooks/useRecommendation.ts
//
// Fetches a single recommendation by ID with SWR. Includes the
// pushback history, acceptance state, alternative link, roadmap
// status, and validation page info — everything the recommendation
// screen needs to render the full experience.

import useSWR from 'swr';
import { api } from '@/services/api-client';
import {
  RecommendationSchema,
  PushbackHistorySchema,
  type Recommendation,
  type PushbackTurn,
  type AlternativeRejected,
} from '@neuralaunch/api-types';
import { z } from 'zod';

// Re-export the shared shapes so existing component imports
// (`import { PushbackTurn } from '@/hooks/useRecommendation'`)
// continue to work. Canonical source: @neuralaunch/api-types.
export type { PushbackTurn, AlternativeRejected };

// Mobile's RiskRow is a narrow slice of the shared Recommendation.risks
// element. Kept as a type alias for any component that imports it
// directly.
export type RiskRow = Recommendation['risks'][number];

// ---------------------------------------------------------------------------
// Response envelope — a Recommendation plus relation fields the API
// route attaches (acceptedAt, pushbackHistory, roadmap + validation
// links). The core Recommendation fields are validated through the
// shared schema; the envelope fields are validated locally because
// they're specific to this route.
// ---------------------------------------------------------------------------

const RecommendationResponseSchema = RecommendationSchema.extend({
  id:                          z.string(),
  acceptedAt:                  z.string().nullable(),
  pushbackHistory:             PushbackHistorySchema,
  alternativeRecommendationId: z.string().nullable(),
  roadmapReady:                z.boolean(),
  roadmapId:                   z.string().nullable(),
  validationPageId:            z.string().nullable(),
  validationSignalStrength:    z.string().nullable(),
});

export type RecommendationData = z.infer<typeof RecommendationResponseSchema>;

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchRecommendation(url: string): Promise<RecommendationData> {
  const raw = await api<unknown>(url);
  return RecommendationResponseSchema.parse(raw);
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
