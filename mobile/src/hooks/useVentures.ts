// src/hooks/useVentures.ts
//
// Fetches the founder's ventures grouped by status, plus the tier
// cap so the UI can render at-cap messaging without a separate
// request. Mirrors the shape `GET /api/discovery/ventures` returns
// (see client/src/app/api/discovery/ventures/route.ts).

import useSWR from 'swr';
import { api } from '@/services/api-client';

export interface VentureCycle {
  id:                   string;
  cycleNumber:          number;
  status:               string;                 // 'in_progress' | 'completed' | 'abandoned'
  selectedForkSummary:  string | null;
  roadmapId:            string | null;
  createdAt:            string;
  completedAt:          string | null;
}

export interface Venture {
  id:             string;
  name:           string;
  status:         string;                       // 'active' | 'paused' | 'completed'
  currentCycleId: string | null;
  archivedAt:     string | null;
  updatedAt:      string;
  progress:       { completedTasks: number; totalTasks: number } | null;
  cycles:         VentureCycle[];
}

export interface VenturesResponse {
  tier:     'free' | 'execute' | 'compound';
  cap:      number;
  ventures: Venture[];
}

export function useVentures() {
  return useSWR<VenturesResponse>(
    '/api/discovery/ventures',
    (url: string) => api<VenturesResponse>(url),
    { revalidateOnFocus: true },
  );
}

export interface GroupedVentures {
  active:    Venture[];
  paused:    Venture[];
  completed: Venture[];
  archived:  Venture[];
}

/**
 * Split a venture list into the four buckets the UI renders. A
 * venture keeps its original `status` when archived — only
 * `archivedAt` toggles — so archived rows are pulled out first.
 */
export function groupVentures(ventures: Venture[]): GroupedVentures {
  const archived  = ventures.filter(v => v.archivedAt !== null);
  const unarch    = ventures.filter(v => v.archivedAt === null);
  const active    = unarch.filter(v => v.status === 'active');
  const paused    = unarch.filter(v => v.status === 'paused');
  const completed = unarch.filter(v => v.status === 'completed');
  return { active, paused, completed, archived };
}
