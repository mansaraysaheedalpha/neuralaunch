// types/thought-stream.ts
/**
 * Centralized Type Definitions for Thought Streaming
 * Ensures consistency across hooks, components, and API routes
 */

export type ThoughtType =
  | "starting"      // Agent is starting up
  | "thinking"      // Agent is processing/analyzing
  | "accessing"     // Agent is accessing a tool/service/database
  | "analyzing"     // Agent is analyzing data
  | "deciding"      // Agent is making a decision
  | "executing"     // Agent is executing an action
  | "completing"    // Agent is completing its work
  | "error"         // Agent encountered an error
  | "deep_reasoning"; // Raw AI reasoning from extended thinking

export type ThoughtMode = "curated" | "deep_dive" | "both";

export interface Thought {
  id: string;
  agentName: string;
  projectId: string;
  type: ThoughtType;
  message: string;
  timestamp: string; // ISO 8601 format
  metadata?: Record<string, unknown>;
  mode?: ThoughtMode; // Track thought source (curated, deep_dive, both)
  rawReasoning?: string; // Store raw AI reasoning from extended thinking
}

export interface ThoughtStreamOptions {
  enabled?: boolean;
  pollingInterval?: number;
  maxThoughts?: number;
}

export interface ThoughtStreamResult {
  thoughts: Thought[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  clearThoughts: () => void;
}

/**
 * Type guard to check if a string is a valid ThoughtType
 */
export function isValidThoughtType(type: string): type is ThoughtType {
  return [
    "starting",
    "thinking",
    "accessing",
    "analyzing",
    "deciding",
    "executing",
    "completing",
    "error",
    "deep_reasoning",
  ].includes(type);
}

/**
 * Helper to create a new thought object
 */
export function createThought(
  agentName: string,
  projectId: string,
  type: ThoughtType,
  message: string,
  metadata?: Record<string, unknown>
): Thought {
  return {
    id: `thought_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    agentName,
    projectId,
    type,
    message,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

/**
 * Sort thoughts by timestamp (oldest first)
 */
export function sortThoughtsByTime(thoughts: Thought[]): Thought[] {
  return [...thoughts].sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

/**
 * Filter thoughts by agent name
 */
export function filterThoughtsByAgent(
  thoughts: Thought[],
  agentName: string
): Thought[] {
  return thoughts.filter((t) => t.agentName === agentName);
}

/**
 * Filter thoughts by type
 */
export function filterThoughtsByType(
  thoughts: Thought[],
  type: ThoughtType
): Thought[] {
  return thoughts.filter((t) => t.type === type);
}

/**
 * Get thoughts after a specific timestamp
 */
export function getThoughtsAfter(
  thoughts: Thought[],
  afterTimestamp: string | Date
): Thought[] {
  const afterDate = new Date(afterTimestamp);
  return thoughts.filter((t) => {
    return new Date(t.timestamp) > afterDate;
  });
}

/**
 * Get the latest thought
 */
export function getLatestThought(thoughts: Thought[]): Thought | null {
  if (thoughts.length === 0) return null;
  const sorted = sortThoughtsByTime(thoughts);
  return sorted[sorted.length - 1];
}

/**
 * Get thought statistics
 */
export interface ThoughtStats {
  total: number;
  byType: Record<ThoughtType, number>;
  byAgent: Record<string, number>;
  timeSpan: number; // milliseconds
  averageInterval: number; // milliseconds
}

export function getThoughtStats(thoughts: Thought[]): ThoughtStats {
  const stats: ThoughtStats = {
    total: thoughts.length,
    byType: {
      starting: 0,
      thinking: 0,
      accessing: 0,
      analyzing: 0,
      deciding: 0,
      executing: 0,
      completing: 0,
      error: 0,
      deep_reasoning: 0,
    },
    byAgent: {},
    timeSpan: 0,
    averageInterval: 0,
  };

  if (thoughts.length === 0) return stats;

  // Count by type
  thoughts.forEach((t) => {
    stats.byType[t.type]++;
  });

  // Count by agent
  thoughts.forEach((t) => {
    stats.byAgent[t.agentName] = (stats.byAgent[t.agentName] || 0) + 1;
  });

  // Calculate time span
  const sorted = sortThoughtsByTime(thoughts);
  const first = new Date(sorted[0].timestamp).getTime();
  const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
  stats.timeSpan = last - first;

  // Calculate average interval
  if (thoughts.length > 1) {
    stats.averageInterval = stats.timeSpan / (thoughts.length - 1);
  }

  return stats;
}