// src/lib/research/types.ts
//
// Shared types for the research tool. Pure types only — no runtime
// imports — so client code that needs to render researchLog entries
// (e.g. an admin debug surface) can import from here without pulling
// in server-only modules.

import { z } from 'zod';

/**
 * Which agent fired the research call. The string is persisted into
 * every researchLog entry so we can audit "what is the recommendation
 * agent researching?" vs "what is the check-in agent researching?"
 * separately and use the data to refine prompts per agent.
 *
 * Stored as a string union (not a Prisma enum) so adding a new agent
 * later does not require a database migration.
 */
export const RESEARCH_AGENTS = [
  'interview',
  'recommendation',
  'pushback',
  'checkin',
  'continuation',
] as const;
export type ResearchAgent = typeof RESEARCH_AGENTS[number];

/**
 * One source returned by the research provider. Title + URL + a short
 * snippet are enough for both the prompt-time renderer and the audit
 * log; we never store the full page content.
 */
export const ResearchSourceSchema = z.object({
  title:   z.string(),
  url:     z.string(),
  snippet: z.string(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

/**
 * One row in a per-record researchLog JSONB column. Append-only.
 *
 * The shape was originally introduced for Recommendation.researchLog
 * (synthesis pipeline). The same shape is now used by every other
 * researchLog column (DiscoverySession.researchLog, Roadmap.researchLog),
 * so a single safeParse helper covers all of them.
 *
 * The `agent` field is a permissive string at the read boundary so
 * old rows from before the shared research tool was extracted (which
 * carried agent='synthesis', a value no longer in RESEARCH_AGENTS)
 * still parse cleanly. New writes are typed against ResearchAgent at
 * the construction site in research-tool.ts so the strict enum is
 * still enforced where it matters — at the producer, not the reader.
 */
export const ResearchLogEntrySchema = z.object({
  query:     z.string(),
  agent:     z.string(),
  timestamp: z.string(),
  answer:    z.string(),
  sources:   z.array(ResearchSourceSchema),
  success:   z.boolean(),
});
export type ResearchLogEntry = z.infer<typeof ResearchLogEntrySchema>;

export const ResearchLogArraySchema = z.array(ResearchLogEntrySchema);
export type ResearchLog = z.infer<typeof ResearchLogArraySchema>;

/**
 * The structured result of one research run. The findings string is
 * the prompt-ready block (delimiter-wrapped, dedup'd, hard-capped);
 * queriesRun is the array that was actually fired (after pre-flight
 * filtering); researchLog is the per-query audit trail to append to
 * the relevant Prisma JSON column.
 */
export interface ResearchFindings {
  findings:    string;
  queriesRun:  string[];
  researchLog: ResearchLogEntry[];
}

/**
 * One trigger query the trigger-detector emits. The orchestrator
 * passes an array of these straight into runResearchQueries, which
 * fires them in parallel and returns a single ResearchFindings.
 *
 * The reasoning field is for the audit log only — the prompt
 * renderer ignores it. We persist it to the researchLog row's
 * `query` field so a future training pipeline can see why each
 * query was constructed the way it was.
 */
export interface DetectedQuery {
  query:     string;
  reasoning: string;
}
