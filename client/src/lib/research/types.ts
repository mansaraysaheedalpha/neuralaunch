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
 * Which research tool the agent chose for a given query. Per the B1
 * spec the agent picks per query — this field is the data that
 * validates or invalidates that architecture. Without `tool` we
 * cannot tell whether agents are choosing the right provider for
 * the right type of query.
 *
 * Same string-union pattern as agent — adding a third tool later is
 * a code change, not a migration.
 */
export const RESEARCH_TOOLS = ['exa_search', 'tavily_search'] as const;
export type ResearchTool = typeof RESEARCH_TOOLS[number];

/**
 * One source returned by a research provider. Title + URL + a short
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
 * The shape is shared by every researchLog column in the database
 * (Recommendation.researchLog, DiscoverySession.researchLog,
 * Roadmap.researchLog), so a single safeParse helper covers all
 * three.
 *
 * Backward compatibility is intentional and load-bearing:
 *
 *   - `agent` is a permissive z.string() (not the strict enum) so
 *     legacy rows from before the shared research tool was extracted
 *     (which carried agent='synthesis', a value no longer in
 *     RESEARCH_AGENTS) still parse cleanly. New writes are typed
 *     against ResearchAgent at the construction site so the strict
 *     enum is enforced where it matters — at the producer.
 *
 *   - `tool` is OPTIONAL because pre-B1 rows were all Tavily and
 *     don't have the field. Defaults to absent on read; writers
 *     emitted by the new tool factory always populate it.
 *
 *   - `resultSummary` is OPTIONAL for the same reason. Old rows
 *     have `answer` instead — same role, different name, retained
 *     for back-compat.
 *
 *   - `answer` is OPTIONAL on the new shape because we no longer
 *     write it (resultSummary replaces it), but old rows still have
 *     it and need to parse cleanly.
 *
 *   - `sources` is OPTIONAL for the new shape — the per-tool
 *     execute function returns the resultSummary string and the
 *     full source list inside it; we don't always carry the
 *     structured sources separately. Old rows have it though, so
 *     it stays parseable.
 *
 *   - `success` is OPTIONAL on the new shape because the new tool
 *     execute functions only persist successful calls (failures
 *     return an error string to the model and are not persisted to
 *     researchLog). Old rows from the orchestrator pattern carried
 *     it for both success and failure rows.
 */
export const ResearchLogEntrySchema = z.object({
  query:         z.string(),
  agent:         z.string(),
  tool:          z.string().optional(),
  resultSummary: z.string().optional(),
  timestamp:     z.string(),
  // Legacy fields — retained so historic rows parse cleanly. New
  // writers do not populate these. The reader is the only consumer
  // and it falls back gracefully when they're missing.
  answer:        z.string().optional(),
  sources:       z.array(ResearchSourceSchema).optional(),
  success:       z.boolean().optional(),
});
export type ResearchLogEntry = z.infer<typeof ResearchLogEntrySchema>;

export const ResearchLogArraySchema = z.array(ResearchLogEntrySchema);
export type ResearchLog = z.infer<typeof ResearchLogArraySchema>;
