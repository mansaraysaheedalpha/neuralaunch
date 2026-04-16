// src/hooks/useRoadmap.ts
//
// Fetches a roadmap by recommendation ID with SWR. Polls while
// status is GENERATING. Includes progress data and phase/task
// details for the interactive task cards.

import { useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/services/api-client';
import {
  StoredRoadmapPhaseSchema,
  type StoredRoadmapTask,
  type StoredRoadmapPhase,
  type CheckInEntry,
} from '@neuralaunch/api-types';
import { type TaskStatus } from '@neuralaunch/constants';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Re-export the cross-app shapes so existing component imports
// (`import { RoadmapTask } from '@/hooks/useRoadmap'`) keep working.
// Canonical source: @neuralaunch/api-types + @neuralaunch/constants.
// ---------------------------------------------------------------------------

export type { StoredRoadmapTask as RoadmapTask };
export type { StoredRoadmapPhase as RoadmapPhase };
export type { CheckInEntry };
export type { TaskStatus };

// ---------------------------------------------------------------------------
// Mobile-specific shapes (not in the shared API schema)
// ---------------------------------------------------------------------------

export interface RoadmapProgress {
  totalTasks:     number;
  completedTasks: number;
  blockedTasks:   number;
  lastActivityAt: string;
  nudgePending:   boolean;
}

export interface RoadmapData {
  id:             string;
  status:         'GENERATING' | 'READY' | 'FAILED' | 'STALE';
  phases:         StoredRoadmapPhase[];
  closingThought: string | null;
  weeklyHours:    number | null;
  totalWeeks:     number | null;
  progress:       RoadmapProgress | null;
  recommendationId: string;
}

// ---------------------------------------------------------------------------
// Runtime-validated response shape. The envelope fields (id, status,
// closingThought, etc.) are mobile-local; the phases array is validated
// against the shared schema so backend drift in the task / check-in
// shape surfaces as a clean error rather than a silent crash.
// ---------------------------------------------------------------------------

const RoadmapResponseSchema = z.union([
  z.object({ status: z.literal('not_started') }),
  z.object({
    id:               z.string(),
    status:           z.enum(['GENERATING', 'READY', 'FAILED', 'STALE']),
    phases:           z.array(StoredRoadmapPhaseSchema),
    closingThought:   z.string().nullable(),
    weeklyHours:      z.number().nullable(),
    totalWeeks:       z.number().nullable(),
    progress:         z
      .object({
        totalTasks:     z.number(),
        completedTasks: z.number(),
        blockedTasks:   z.number(),
        lastActivityAt: z.string(),
        nudgePending:   z.boolean(),
      })
      .nullable(),
    recommendationId: z.string(),
  }),
]);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

async function fetchRoadmap(url: string): Promise<RoadmapData | null> {
  try {
    const raw = await api<unknown>(url);
    const parsed = RoadmapResponseSchema.safeParse(raw);
    if (!parsed.success) return null;
    if ('phases' in parsed.data) return parsed.data;
    return null;
  } catch {
    return null;
  }
}

export function useRoadmap(recommendationId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    recommendationId
      ? `/api/discovery/recommendations/${recommendationId}/roadmap`
      : null,
    fetchRoadmap,
    {
      revalidateOnFocus: true,
      dedupingInterval: 3000,
    },
  );

  const isGenerating = data?.status === 'GENERATING';

  // Poll while generating
  useEffect(() => {
    if (!isGenerating) return;
    const timer = setInterval(() => { void mutate(); }, 3000);
    return () => clearInterval(timer);
  }, [isGenerating, mutate]);

  return {
    roadmap: data,
    isLoading,
    isGenerating,
    error,
    refresh: mutate,
  };
}
