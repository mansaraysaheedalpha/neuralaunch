// src/lib/research/constants.ts
//
// Tunable knobs for the shared research tool. Every magic number
// that affects research behaviour lives here, never inline.

import type { ResearchAgent } from './types';

// ---------------------------------------------------------------------------
// Tavily transport tuning
// ---------------------------------------------------------------------------

/** Tavily's hard limit on a single query string is 400 chars; we leave headroom. */
export const TAVILY_MAX_QUERY_CHARS = 380;

/** Per-query wall clock. Tavily occasionally takes 20-25s on the cold path. */
export const RESEARCH_QUERY_TIMEOUT_MS = 30_000;

/** Single retry on transient failure. */
export const RESEARCH_MAX_ATTEMPTS = 2;

/** Linear backoff between retry attempts. */
export const RESEARCH_RETRY_BACKOFF_MS = 500;

/** Hard cap on the rendered findings block before it enters any LLM prompt. */
export const MAX_FINDINGS_CHARS = 4_000;

/** Tavily hits we keep per query after dedup. */
export const MAX_SOURCES_PER_QUERY = 3;

/** Per-source snippet length in the rendered prompt block. */
export const MAX_SOURCE_CONTENT_CHARS = 220;

/** Per-query answer length in the rendered prompt block. */
export const MAX_ANSWER_CHARS = 700;

/** Per-source title length in the rendered prompt block. */
export const SOURCES_PER_HIT_TITLE_CHARS = 180;

/**
 * Per-BATCH wall clock cap for runResearchQueries. Each individual
 * query has its own RESEARCH_QUERY_TIMEOUT_MS (30s), but a batch of
 * 3 queries hitting their per-query timeout would consume 30s of
 * the calling route's maxDuration even though they ran in parallel
 * (the slowest query holds the whole batch). The batch cap races
 * the in-flight queries against this wall clock so a single slow
 * query can't pin the whole batch at the per-query ceiling.
 *
 * Set well below any caller's maxDuration to leave room for the
 * downstream LLM call. The current callers all have maxDuration
 * >= 60s and need ~30-40s for the downstream agent call, so 25s
 * gives the research batch a generous half of the budget without
 * pinching the rest of the request.
 */
export const RESEARCH_BATCH_TIMEOUT_MS = 25_000;

// ---------------------------------------------------------------------------
// Per-agent call budgets
//
// These are SOFT caps. The trigger detector + each agent's caller
// are responsible for honouring them; the research tool itself
// trusts the caller and runs whatever it is given. Keeping the
// budgets in one place lets us audit and tune without grepping
// through five integration sites.
//
// Numbers come directly from RESEARCH_TOOL_SPEC.md "Research Call
// Budget Summary" — adjust the spec if you adjust these.
// ---------------------------------------------------------------------------

export const RESEARCH_BUDGETS: Record<ResearchAgent, { perInvocation: number; description: string }> = {
  interview: {
    perInvocation: 4, // 2-4 per session, cap at 4
    description:   'Selective competitor / regulation / market-claim verification during the interview.',
  },
  recommendation: {
    perInvocation: 8, // 4-8 per session
    description:   'Competitive landscape, tools, pricing benchmarks, regulatory context. Always runs.',
  },
  pushback: {
    perInvocation: 3, // 1-3 per pushback round
    description:   'Verify founder-named alternatives, market challenges, alternative approaches.',
  },
  checkin: {
    perInvocation: 2, // 0-2 per check-in
    description:   'Concrete unblock help — find vendors, tools, market data when the founder is stuck.',
  },
  continuation: {
    perInvocation: 6, // 3-6 per continuation
    description:   'Market changes since recommendation, fork viability, parking-lot context.',
  },
} as const;
