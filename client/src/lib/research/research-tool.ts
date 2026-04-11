// src/lib/research/research-tool.ts
//
// The shared research tool — single agent-aware entry point for
// every researching surface in the codebase. Replaces the per-agent
// bespoke pipelines the spec calls out in
// docs/RESEARCH_TOOL_SPEC.md.
//
// The tool is intentionally narrow: it takes a list of pre-built
// queries plus the agent identity, fires them in parallel against
// the configured provider (Tavily today, with an Exa adaptor slot
// reserved), and returns a structured ResearchFindings ready for
// (a) injection into an LLM prompt and (b) appending to the right
// JSONB column.
//
// What this module does NOT do:
//   - It does not decide WHEN to research. That is the trigger
//     detector's job (lib/research/trigger-detector.ts) for the
//     conditional callers, or the agent itself for unconditional
//     callers (Recommendation, Continuation).
//   - It does not decide WHAT to research. The query strings are
//     constructed by per-agent helpers and passed in.
//   - It does not write to the database. Persistence is the calling
//     route's responsibility, using the helpers in log-helpers.ts.

import 'server-only';
import { logger } from '@/lib/logger';
import { isResearchConfigured, searchOnce } from './tavily-client';
import {
  dedupHits,
  joinAndCapFindings,
  renderQueryBlock,
  toResearchSource,
} from './prompt-rendering';
import type { DetectedQuery, ResearchAgent, ResearchFindings, ResearchLogEntry } from './types';

export interface RunResearchInput {
  /** Which agent fired this batch — persisted to every log entry. */
  agent:     ResearchAgent;
  /** Pre-built queries. Empty array → returns empty findings without calling Tavily. */
  queries:   DetectedQuery[];
  /** A correlation id (sessionId, recommendationId, roadmapId) for the structured logs. */
  contextId: string;
}

/**
 * Execute a batch of research queries and return prompt-ready
 * findings + a per-query audit log.
 *
 * Fail-open posture: a query that throws is recorded as a failure
 * row in researchLog and the others continue. The caller's prompt
 * still gets whatever findings succeeded; a fully failed batch
 * returns an empty findings string and the caller proceeds without
 * research rather than crashing.
 */
export async function runResearchQueries(input: RunResearchInput): Promise<ResearchFindings> {
  const { agent, queries, contextId } = input;
  const log = logger.child({ module: 'ResearchTool', agent, contextId });
  const startedAt = Date.now();

  // No-op fast path: empty input is the trigger detector saying
  // "nothing to research right now" (Interview, Pushback, Check-in).
  if (queries.length === 0) {
    return { findings: '', queriesRun: [], researchLog: [] };
  }

  if (!isResearchConfigured()) {
    log.warn('[Research] Skipped — TAVILY_API_KEY not configured for this environment');
    return { findings: '', queriesRun: [], researchLog: [] };
  }

  log.info('[Research] Starting batch', {
    queryCount: queries.length,
    queries:    queries.map(q => q.query),
  });

  // Fire all queries in parallel. Promise.allSettled so a single
  // failure does not poison the batch.
  const results = await Promise.allSettled(
    queries.map(({ query }) => searchOnce(query, log)),
  );

  const sections:    string[]            = [];
  const researchLog: ResearchLogEntry[]  = [];
  const seenUrls = new Set<string>();
  const now = new Date().toISOString();

  let successCount = 0;
  let failureCount = 0;
  let totalHitsUsed = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const { query } = queries[i];

    if (result.status === 'rejected') {
      failureCount++;
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      log.warn('[Research] Query permanently failed', { queryIdx: i, query, reason });
      researchLog.push({
        query,
        agent,
        timestamp: now,
        answer:    '',
        sources:   [],
        success:   false,
      });
      continue;
    }

    successCount++;
    const { answer, results: hits } = result.value;
    const freshHits = dedupHits(hits ?? [], seenUrls);
    totalHitsUsed += freshHits.length;

    sections.push(renderQueryBlock({ query, answer, freshHits }));

    researchLog.push({
      query,
      agent,
      timestamp: now,
      answer:    answer ?? '',
      sources:   freshHits.map(toResearchSource),
      success:   true,
    });
  }

  const findings  = joinAndCapFindings(sections);
  const elapsedMs = Date.now() - startedAt;

  if (!findings) {
    log.warn('[Research] Empty findings — all queries failed or returned no usable content', {
      queriesAttempted: queries.length,
      failureCount,
      elapsedMs,
    });
  } else {
    log.info('[Research] Batch complete', {
      queriesAttempted: queries.length,
      successCount,
      failureCount,
      totalHitsUsed,
      uniqueUrls:       seenUrls.size,
      findingsChars:    findings.length,
      elapsedMs,
    });
  }

  return {
    findings,
    queriesRun: queries.map(q => q.query),
    researchLog,
  };
}
