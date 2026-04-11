// src/lib/research/conditional-research.ts
//
// Convenience wrapper that combines trigger-detection with the
// research-tool call into a single function. Used by the three
// conditional researching agents (Interview, Pushback, Check-in)
// so each integration site is one helper call instead of two
// separate calls + manual fallthrough handling.
//
// Recommendation and Continuation skip this helper and call
// runResearchQueries directly with their pre-built unconditional
// query sets — no trigger detection, no skip path.

import 'server-only';
import { runResearchQueries } from './research-tool';
import { detectResearchTriggers } from './trigger-detector';
import type { ResearchAgent, ResearchFindings } from './types';

export interface RunConditionalResearchInput {
  /** Which agent fired this. Persisted to every log entry. */
  agent:             ResearchAgent;
  /** The founder's raw message — fed to the trigger detector. */
  founderMessage:    string;
  /** Optional belief-state market hint for query disambiguation. */
  geographicMarket?: string | null;
  /** Correlation id for structured logs (sessionId / recommendationId / roadmapId). */
  contextId:         string;
}

/**
 * Run the full conditional-research happy path:
 *
 *   1. Trigger detector pre-filters the founder message.
 *   2. If pre-filter passes, the LLM extractor builds queries.
 *   3. If queries come back, fire them via runResearchQueries.
 *   4. Otherwise return empty findings — the caller's main agent
 *      proceeds without research, which is the desired behaviour
 *      for messages that have nothing externally verifiable.
 *
 * Always returns a ResearchFindings shape, never throws. Trigger
 * detection failures and Tavily failures are both caught inside
 * the wrapped helpers and surfaced as empty findings + a log line.
 * The caller's main agent never blocks on research being available.
 */
export async function runConditionalResearch(
  input: RunConditionalResearchInput,
): Promise<ResearchFindings> {
  const detection = await detectResearchTriggers({
    agent:            input.agent,
    founderMessage:   input.founderMessage,
    geographicMarket: input.geographicMarket,
    contextId:        input.contextId,
  });

  if (detection.skipped || detection.queries.length === 0) {
    return { findings: '', queriesRun: [], researchLog: [] };
  }

  return await runResearchQueries({
    agent:     input.agent,
    queries:   detection.queries,
    contextId: input.contextId,
  });
}
