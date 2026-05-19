// src/lib/ideation/stage4-opportunities/verdict-pushback.test.ts
//
// Two-phase verdict-pushback engine tests. Mocked at the AI SDK +
// withModelFallback boundary so no real model calls fire. The
// reasoning phase returns canned markdown; the emit phase returns
// canned structured output; we verify call shape + post-emit
// action-invariant coercion + history bookkeeping.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (value: unknown, _max?: number) => `[[[${String(value)}]]]`,
}));

const aiMock = vi.hoisted(() => ({
  generateText: vi.fn(),
}));
vi.mock('ai', () => ({
  generateText: aiMock.generateText,
  Output: { object: <T>(args: { schema: T }) => args },
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (modelId: string) => ({ modelId }),
}));

const fallbackMock = vi.hoisted(() => ({ withModelFallback: vi.fn() }));
vi.mock('@/lib/ai/with-model-fallback', () => ({
  withModelFallback: fallbackMock.withModelFallback,
}));

vi.mock('@/lib/ai/prompt-cache', () => ({
  cachedUserMessages: (stable: string, volatile: string) => [
    { role: 'user', content: `${stable}\n\n${volatile}` },
  ],
}));

vi.mock('@/lib/observability', () => ({
  withAgentSpan: (_opts: unknown, run: (setAttr: () => void) => Promise<unknown>) => run(() => undefined),
  ATTR_AGENT_TIER:       'agent.tier',
  ATTR_AGENT_MODEL:      'agent.model',
  ATTR_TOKENS_INPUT:     'tokens.input',
  ATTR_TOKENS_OUTPUT:    'tokens.output',
  ATTR_LATENCY_TOTAL_MS: 'latency.total_ms',
}));

import {
  runVerdictPushbackRound,
  applyVerdictMutation,
  MAX_OPPORTUNITY_PUSHBACK_ROUNDS,
  __testInternals,
} from './verdict-pushback';
import { buildOpportunityEvaluation, applyAgentVerdict } from './state';
import type { OpportunityEvaluation } from './schema';

interface FallbackConfig { primary: string; fallback: string }
type Runner = (modelId: string) => Promise<unknown>;

function fakeOpportunity(overrides: Partial<OpportunityEvaluation> = {}): OpportunityEvaluation {
  const base = applyAgentVerdict(
    buildOpportunityEvaluation({ painPointId: 'pp', painPointSummary: 'X' }),
    'pursue',
    'initial reasoning',
  );
  return { ...base, ...overrides };
}

beforeEach(() => {
  aiMock.generateText.mockReset();
  fallbackMock.withModelFallback.mockReset();
  fallbackMock.withModelFallback.mockImplementation(
    async (_callsite: string, config: FallbackConfig, run: Runner) => run(config.primary),
  );
});

// ---------------------------------------------------------------------------
// Phase wiring
// ---------------------------------------------------------------------------

describe('runVerdictPushbackRound', () => {
  it('reasoning runs Opus → Sonnet fallback; emit runs Sonnet → Haiku fallback', async () => {
    // First call: reasoning phase (text output).
    aiMock.generateText.mockResolvedValueOnce({ text: 'analysis md', usage: {} });
    // Second call: emit phase (structured output).
    aiMock.generateText.mockResolvedValueOnce({
      output: { mode: 'analytical', action: 'defend', message: 'Holding the line.', newVerdict: null, newReasoning: null },
      usage: {},
    });

    await runVerdictPushbackRound({
      opportunity:    fakeOpportunity(),
      founderMessage: 'I disagree',
      contextId:      's',
    });

    const reasoningCfg = fallbackMock.withModelFallback.mock.calls[0][1] as FallbackConfig;
    const emitCfg      = fallbackMock.withModelFallback.mock.calls[1][1] as FallbackConfig;
    expect(reasoningCfg.primary).toBe('claude-opus-4-6');
    expect(reasoningCfg.fallback).toBe('claude-sonnet-4-6');
    expect(emitCfg.primary).toBe('claude-sonnet-4-6');
    expect(emitCfg.fallback).toBe('claude-haiku-4-5-20251001');
  });
});

// ---------------------------------------------------------------------------
// Action-invariant coercion
// ---------------------------------------------------------------------------

describe('action invariants — post-emit coercion', () => {
  function emit(payload: Record<string, unknown>) {
    aiMock.generateText.mockResolvedValueOnce({ text: 'md', usage: {} });
    aiMock.generateText.mockResolvedValueOnce({ output: payload, usage: {} });
  }

  it("hard-cap round forces action='closing' even when emit returned defend", async () => {
    const history = Array.from({ length: MAX_OPPORTUNITY_PUSHBACK_ROUNDS - 1 }, (_, i) => ({
      round:          i + 1,
      founderMessage: `m${i}`,
      agentMessage:   `r${i}`,
      agentMode:      'analytical' as const,
      agentAction:    'defend' as const,
      raisedAt:       new Date().toISOString(),
    }));
    emit({ mode: 'analytical', action: 'defend', message: 'no', newVerdict: null, newReasoning: null });
    const result = await runVerdictPushbackRound({
      opportunity:    fakeOpportunity({ pushbackHistory: history }),
      founderMessage: 'last round', contextId: 's',
    });
    expect(result.action).toBe('closing');
    expect(result.updated.pushbackHistory).toHaveLength(MAX_OPPORTUNITY_PUSHBACK_ROUNDS);
  });

  it("action='change_verdict' without newVerdict coerces to 'defend'", async () => {
    emit({ mode: 'analytical', action: 'change_verdict', message: 'ok', newVerdict: null, newReasoning: null });
    const result = await runVerdictPushbackRound({
      opportunity:    fakeOpportunity(),
      founderMessage: 'change it', contextId: 's',
    });
    expect(result.action).toBe('defend');
    expect(result.updated.agentVerdict).toBe('pursue');  // unchanged
  });

  it("action='change_verdict' with valid newVerdict applies the new verdict + reasoning", async () => {
    emit({
      mode:         'analytical',
      action:       'change_verdict',
      message:      'fair point',
      newVerdict:   'pursue_with_caveats',
      newReasoning: 'updated reasoning with caveat',
    });
    const result = await runVerdictPushbackRound({
      opportunity:    fakeOpportunity(),
      founderMessage: 'reconsider', contextId: 's',
    });
    expect(result.action).toBe('change_verdict');
    expect(result.updated.agentVerdict).toBe('pursue_with_caveats');
    expect(result.updated.agentReasoning).toBe('updated reasoning with caveat');
  });

  it("non-change_verdict actions null out newVerdict + newReasoning even if model returned them", async () => {
    emit({
      mode:         'analytical',
      action:       'defend',
      message:      'no change',
      newVerdict:   'drop',
      newReasoning: 'should be discarded',
    });
    const result = await runVerdictPushbackRound({
      opportunity:    fakeOpportunity(),
      founderMessage: 'm', contextId: 's',
    });
    expect(result.updated.agentVerdict).toBe('pursue');  // unchanged
  });
});

// ---------------------------------------------------------------------------
// Version + history bookkeeping
// ---------------------------------------------------------------------------

describe('version + history bookkeeping', () => {
  it('increments pushbackVersion by 1 each round', async () => {
    aiMock.generateText.mockResolvedValueOnce({ text: 'md', usage: {} });
    aiMock.generateText.mockResolvedValueOnce({
      output: { mode: 'analytical', action: 'defend', message: 'm', newVerdict: null, newReasoning: null },
      usage: {},
    });
    const opp = fakeOpportunity({ pushbackVersion: 3 });
    const result = await runVerdictPushbackRound({ opportunity: opp, founderMessage: 'x', contextId: 's' });
    expect(result.updated.pushbackVersion).toBe(4);
  });

  it('appends an entry to pushbackHistory with the right round number + fields', async () => {
    aiMock.generateText.mockResolvedValueOnce({ text: 'md', usage: {} });
    aiMock.generateText.mockResolvedValueOnce({
      output: { mode: 'fear', action: 'defend', message: 'agent says', newVerdict: null, newReasoning: null },
      usage: {},
    });
    const result = await runVerdictPushbackRound({
      opportunity: fakeOpportunity(), founderMessage: 'founder says', contextId: 's',
    });
    expect(result.updated.pushbackHistory).toHaveLength(1);
    const entry = result.updated.pushbackHistory[0];
    expect(entry.round).toBe(1);
    expect(entry.founderMessage).toBe('founder says');
    expect(entry.agentMessage).toBe('agent says');
    expect(entry.agentMode).toBe('fear');
    expect(entry.agentAction).toBe('defend');
  });
});

// ---------------------------------------------------------------------------
// Pure mutation
// ---------------------------------------------------------------------------

describe('applyVerdictMutation', () => {
  it('returns the new verdict + reasoning on change_verdict', () => {
    const opp = fakeOpportunity();
    const result = applyVerdictMutation(opp, 'change_verdict', 'drop', 'new reasoning');
    expect(result).toEqual({ agentVerdict: 'drop', agentReasoning: 'new reasoning' });
  });

  it('returns prior verdict on non-change_verdict actions', () => {
    const opp = fakeOpportunity();
    for (const action of ['defend', 'continue_dialogue', 'closing'] as const) {
      const result = applyVerdictMutation(opp, action, null, null);
      expect(result).toEqual({ agentVerdict: opp.agentVerdict, agentReasoning: opp.agentReasoning });
    }
  });

  it('falls back to prior reasoning when newReasoning is null but action is change_verdict', () => {
    const opp = fakeOpportunity();
    const result = applyVerdictMutation(opp, 'change_verdict', 'drop', null);
    expect(result.agentReasoning).toBe(opp.agentReasoning);
  });
});

// ---------------------------------------------------------------------------
// Prompt invariants
// ---------------------------------------------------------------------------

describe('system-prompt invariants', () => {
  it('reasoning prompt names the analysis output shape and forbids new-verdict proposal', () => {
    expect(__testInternals.REASONING_SYSTEM_PROMPT).toContain('REASONING phase');
    expect(__testInternals.REASONING_SYSTEM_PROMPT).toContain('Do NOT propose a specific new verdict');
  });
  it('emit prompt enumerates the four actions', () => {
    const p = __testInternals.EMIT_SYSTEM_PROMPT;
    expect(p).toContain('continue_dialogue');
    expect(p).toContain('defend');
    expect(p).toContain('change_verdict');
    expect(p).toContain('closing');
  });
  it('emit prompt requires newVerdict + newReasoning on change_verdict', () => {
    expect(__testInternals.EMIT_SYSTEM_PROMPT).toContain('newVerdict + newReasoning REQUIRED');
  });
});
