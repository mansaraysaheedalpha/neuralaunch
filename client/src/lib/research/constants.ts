// src/lib/research/constants.ts
//
// Tunable knobs for the shared research tool. Every magic number
// that affects research behaviour lives here, never inline.

import type { ResearchAgent } from './types';

// ---------------------------------------------------------------------------
// Provider transport tuning — shared by both Tavily and Exa clients
// ---------------------------------------------------------------------------

/**
 * Per-query wall clock for both providers. Tavily occasionally takes
 * 20-25s on the cold path; Exa is usually faster but the same
 * ceiling applies for symmetry.
 */
export const RESEARCH_QUERY_TIMEOUT_MS = 30_000;

/** Single retry on transient failure. */
export const RESEARCH_MAX_ATTEMPTS = 2;

/** Linear backoff between retry attempts. */
export const RESEARCH_RETRY_BACKOFF_MS = 500;

// ---------------------------------------------------------------------------
// Result rendering caps — shared by both renderers in render-summaries.ts
// ---------------------------------------------------------------------------

/** Hard cap on the rendered findings block before it enters any LLM prompt. */
export const MAX_FINDINGS_CHARS = 4_000;

/** Source hits we keep per query. */
export const MAX_SOURCES_PER_QUERY = 3;

/** Per-source snippet length in the rendered prompt block. */
export const MAX_SOURCE_CONTENT_CHARS = 220;

/** Per-query answer length in the rendered prompt block. */
export const MAX_ANSWER_CHARS = 700;

/** Per-source title length in the rendered prompt block. */
export const SOURCES_PER_HIT_TITLE_CHARS = 180;

// ---------------------------------------------------------------------------
// Per-agent step budgets
//
// In the B1 architecture the agent picks tools mid-call inside the AI
// SDK loop. The per-agent budget is now a STEP cap (the value passed
// to `stopWhen: stepCountIs(N)`), not a query count. One step is one
// model call + however many tools that call requested. The numbers
// below come straight from RESEARCH_TOOL_SPEC.md "Research Call
// Budget Summary" — adjust the spec if you adjust these.
//
// Note: stepCountIs is the GENERATION step count, not the tool call
// count. Each step gives the model one chance to think; if the model
// uses that turn to call a tool, the next step processes the result.
// A budget of N means up to N model invocations, which is roughly
// up to N-1 research calls plus the final structured-output emission.
// ---------------------------------------------------------------------------

export const RESEARCH_BUDGETS: Record<ResearchAgent, { steps: number; description: string }> = {
  interview: {
    // Spec: 2-4 research calls per turn. Budget = 5 so even at the
    // upper bound there is one step left for the final text emission
    // (the pre-research helper uses text() output, not structured).
    steps:       5,
    description: 'Selective competitor / regulation / market-claim verification during the interview.',
  },
  recommendation: {
    // Spec: 4-8 research calls per session. Budget = 10 so the model
    // has explicit room for up to 8 tool calls plus the structured
    // Recommendation emission with one step of headroom.
    steps:       10,
    description: 'Competitive landscape, tools, pricing benchmarks, regulatory context. Always runs.',
  },
  pushback: {
    // Spec: 1-3 research calls per round. Budget = 5 so the
    // worst case (3 calls + structured PushbackResponse emission)
    // has explicit headroom.
    steps:       5,
    description: 'Verify founder-named alternatives, market challenges, alternative approaches.',
  },
  checkin: {
    // Spec: 0-2 research calls per check-in. Budget = 4 for headroom
    // on the structured CheckInResponse emission.
    steps:       4,
    description: 'Concrete unblock help — find vendors, tools, market data when the founder is stuck.',
  },
  continuation: {
    // Spec: 3-6 research calls per continuation. Budget = 8 for
    // headroom on the structured ContinuationBrief emission. The
    // brief is the highest-stakes call in the system, so generosity
    // here is justified.
    steps:       8,
    description: 'Market changes since recommendation, fork viability, parking-lot context.',
  },
  composer: {
    // Spec: 2-6 research calls per generation. Budget = 8 gives the
    // agent room for up to 6 tool calls (recipient company lookup,
    // industry norms, market context) plus the structured
    // ComposerOutput emission with one step of headroom.
    steps:       8,
    description: 'Recipient research, industry norms, market context for outreach messages.',
  },
} as const;
