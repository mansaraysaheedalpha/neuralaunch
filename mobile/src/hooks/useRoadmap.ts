// src/hooks/useRoadmap.ts
//
// Fetches a roadmap by recommendation ID with SWR. Polls while
// status is GENERATING. Includes progress data and phase/task
// details for the interactive task cards.

import { useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/services/api-client';

// ---------------------------------------------------------------------------
// Types — mirror the web app's StoredRoadmapTask + Phase
// ---------------------------------------------------------------------------

export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export interface CheckInEntry {
  id:            string;
  timestamp:     string;
  category:      'completed' | 'blocked' | 'unexpected' | 'question';
  freeText:      string;
  agentResponse: string;
  agentAction:   string;
  round:         number;
  proposedChanges?: Array<{
    taskTitle:               string;
    proposedTitle?:          string;
    proposedDescription?:    string;
    proposedSuccessCriteria?: string;
    rationale:               string;
  }>;
}

export interface RoadmapTask {
  title:           string;
  description:     string;
  rationale:       string;
  timeEstimate:    string;
  successCriteria: string;
  resources?:      string[];
  suggestedTools?: string[];
  status?:         TaskStatus;
  completedAt?:    string | null;
  checkInHistory?: CheckInEntry[];
}

export interface RoadmapPhase {
  phase:         number;
  title:         string;
  objective:     string;
  durationWeeks: number;
  tasks:         RoadmapTask[];
}

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
  phases:         RoadmapPhase[];
  closingThought: string | null;
  weeklyHours:    number | null;
  totalWeeks:     number | null;
  progress:       RoadmapProgress | null;
  recommendationId: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

async function fetchRoadmap(url: string): Promise<RoadmapData | null> {
  try {
    const data = await api<RoadmapData | { status: 'not_started' }>(url);
    if ('phases' in data) return data as RoadmapData;
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
