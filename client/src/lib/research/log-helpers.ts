// src/lib/research/log-helpers.ts
//
// Persistence helpers for the researchLog JSONB columns. Today the
// shape lives on three rows: Recommendation, DiscoverySession, and
// Roadmap. Every column shares the same array-of-ResearchLogEntry
// schema, so a single safeParse + append helper covers all of them.
//
// The append is bounded — we cap each column at MAX_LOG_ENTRIES
// items so the JSONB doesn't grow without limit on a long-running
// roadmap with many check-ins. Older entries fall off the front; the
// most recent activity is what matters for both audit and the
// next-call-context use case.

import { ResearchLogArraySchema, type ResearchLog, type ResearchLogEntry } from './types';

/**
 * Maximum entries we keep on any single researchLog column. Each
 * entry is small (~500-800 bytes after dedup), so 100 entries is
 * roughly 60-80 KB — comfortable for JSONB.
 *
 * The cap is per-record, not per-agent. A roadmap with 5 check-ins
 * × 2 queries each + 1 continuation × 6 queries = 16 entries. Even
 * a very active multi-cycle roadmap stays well below the cap.
 */
export const MAX_RESEARCH_LOG_ENTRIES = 100;

/**
 * Safely parse a researchLog JSONB column into a typed array.
 * Returns an empty array on parse failure (corrupt row, schema
 * drift, null) so the caller can proceed without a runtime crash.
 *
 * Mirrors the safeParseDiscoveryContext / safeParsePushbackHistory
 * pattern used everywhere else in the codebase for JSONB reads.
 */
export function safeParseResearchLog(value: unknown): ResearchLog {
  const parsed = ResearchLogArraySchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

/**
 * Append new entries to an existing log and apply the per-column
 * cap. Pure — does not mutate the input. The cap drops the oldest
 * entries first so a new write never silently fails because the
 * column is full.
 */
export function appendResearchLog(
  current: ResearchLog,
  newEntries: ResearchLogEntry[],
): ResearchLog {
  if (newEntries.length === 0) return current;
  const combined = [...current, ...newEntries];
  if (combined.length <= MAX_RESEARCH_LOG_ENTRIES) return combined;
  // Drop the oldest entries first.
  return combined.slice(combined.length - MAX_RESEARCH_LOG_ENTRIES);
}
