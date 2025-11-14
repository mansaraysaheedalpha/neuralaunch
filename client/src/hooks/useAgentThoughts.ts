// hooks/useAgentThoughts.ts
/**
 * Real-Time Agent Thought Streaming Hook
 * Fetches agent thoughts incrementally with 1-second polling
 * Only fetches new thoughts since last update for efficiency
 */

import { useState, useEffect, useRef } from "react";

export interface Thought {
  id: string;
  agentName: string;
  projectId: string;
  type: ThoughtType;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type ThoughtType =
  | "starting"
  | "thinking"
  | "accessing"
  | "analyzing"
  | "deciding"
  | "executing"
  | "completing"
  | "error";

interface UseAgentThoughtsReturn {
  thoughts: Thought[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  clearThoughts: () => void;
}

export function useAgentThoughts(
  projectId: string | undefined,
  options?: {
    enabled?: boolean;
    pollingInterval?: number;
    maxThoughts?: number;
  }
): UseAgentThoughtsReturn {
  const {
    enabled = true,
    pollingInterval = 1000,
    maxThoughts = 100,
  } = options || {};

  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchTimeRef = useRef<Date | null>(null);
  const isInitialFetchRef = useRef(true);

  const fetchThoughts = async (isInitial: boolean = false) => {
    if (!projectId || !enabled) return;

    try {
      // Build URL with incremental fetch
      const url = new URL(
        `/api/projects/${projectId}/thoughts`,
        window.location.origin
      );

      if (!isInitial && lastFetchTimeRef.current) {
        url.searchParams.set("after", lastFetchTimeRef.current.toISOString());
      }

      const res = await fetch(url.toString());

      if (!res.ok) {
        throw new Error(`Failed to fetch thoughts: ${res.status}`);
      }

      const data = await res.json();

      if (data.thoughts && data.thoughts.length > 0) {
        setThoughts((prev) => {
          // Combine old and new thoughts
          const combined = [...prev, ...data.thoughts];

          // Sort by timestamp
          combined.sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          // Remove duplicates by ID
          const unique = combined.filter(
            (thought, index, self) =>
              index === self.findIndex((t) => t.id === thought.id)
          );

          // Limit to maxThoughts (keep most recent)
          if (unique.length > maxThoughts) {
            return unique.slice(-maxThoughts);
          }

          return unique;
        });

        // Update last fetch time to the latest thought timestamp
        const latestThought = data.thoughts[data.thoughts.length - 1];
        lastFetchTimeRef.current = new Date(latestThought.timestamp);
      }

      if (isInitialFetchRef.current) {
        setIsLoading(false);
        isInitialFetchRef.current = false;
      }

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      console.error("[useAgentThoughts] Error:", err);
    }
  };

  const refetch = async () => {
    lastFetchTimeRef.current = null;
    isInitialFetchRef.current = true;
    setIsLoading(true);
    await fetchThoughts(true);
  };

  const clearThoughts = () => {
    setThoughts([]);
    lastFetchTimeRef.current = null;
    isInitialFetchRef.current = true;
  };

  // Initial fetch
  useEffect(() => {
    if (projectId && enabled) {
      fetchThoughts(true);
    }
  }, [projectId, enabled]);

  // Polling for new thoughts
  useEffect(() => {
    if (!projectId || !enabled) return;

    const interval = setInterval(() => {
      fetchThoughts(false);
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [projectId, enabled, pollingInterval]);

  return {
    thoughts,
    isLoading,
    error,
    refetch,
    clearThoughts,
  };
}

/**
 * Filter thoughts by agent name
 */
export function useAgentThoughtsByAgent(
  projectId: string | undefined,
  agentName?: string
): UseAgentThoughtsReturn {
  const { thoughts: allThoughts, ...rest } = useAgentThoughts(projectId);

  const filteredThoughts = agentName
    ? allThoughts.filter((t) => t.agentName === agentName)
    : allThoughts;

  return {
    thoughts: filteredThoughts,
    ...rest,
  };
}
