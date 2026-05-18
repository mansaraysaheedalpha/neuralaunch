// src/lib/ideation/stage4-opportunities/verdict-synthesizer.test.ts
//
// Verdict-synthesizer contract tests. Mocked at the AI SDK boundary
// so the model decision is canned per case. The synthesizer is an
// LLM call, not a deterministic rule, so we verify call shape +
// prompt invariants rather than per-case verdicts.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (value: unknown, _max?: number) => `[[[${String(value)}]]]`,
}));

const aiMock = vi.hoisted(() => ({ generateText: vi.fn() }));
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

import { synthesizeVerdict, __testInternals } from './verdict-synthesizer';
import type { LayerAResearch, LayerBExtractedSignal } from './schema';

interface FallbackConfig { primary: string; fallback: string }
type Runner = (modelId: string) => Promise<unknown>;

function fakeLayerA(): LayerAResearch {
  return {
    marketReality:  { reasoning: 'reality',  citations: [], confidence: 0.7 },
    customerAccess: { reasoning: 'access',   citations: [], confidence: 0.6 },
    willPeoplePay:  { reasoning: 'pay',      citations: [], confidence: 0.5 },
    marketSize:     { reasoning: 'size',     citations: [], confidence: 0.4 },
    researchedAt:   '2026-05-15T10:00:00.000Z',
  };
}

function fakeStrongLayerB(): LayerBExtractedSignal {
  return {
    validationStrength:   'strong',
    keyQuotes:            ['I have this problem'],
    sentimentBreakdown:   { positive: 5, neutral: 2, negative: 1 },
    contradictionsRaised: [],
  };
}

beforeEach(() => {
  aiMock.generateText.mockReset();
  fallbackMock.withModelFallback.mockReset();
  fallbackMock.withModelFallback.mockImplementation(
    async (_callsite: string, config: FallbackConfig, run: Runner) => run(config.primary),
  );
});

describe('synthesizeVerdict', () => {
  it('returns the structured { verdict, reasoning } shape', async () => {
    aiMock.generateText.mockResolvedValue({ output: { verdict: 'pursue', reasoning: 'because reasons' }, usage: {} });
    const result = await synthesizeVerdict({
      painPointSummary: 'p', layerAResearch: fakeLayerA(), layerBSignal: fakeStrongLayerB(),
    });
    expect(result).toEqual({ verdict: 'pursue', reasoning: 'because reasons' });
  });

  it('uses Sonnet primary + Haiku fallback', async () => {
    aiMock.generateText.mockResolvedValue({ output: { verdict: 'pursue', reasoning: 'x' }, usage: {} });
    await synthesizeVerdict({ painPointSummary: 'p', layerAResearch: fakeLayerA(), layerBSignal: fakeStrongLayerB() });
    const cfg = fallbackMock.withModelFallback.mock.calls[0][1] as FallbackConfig;
    expect(cfg.primary).toBe('claude-sonnet-4-6');
    expect(cfg.fallback).toBe('claude-haiku-4-5-20251001');
  });

  it('handles a null Layer A by labeling it "not yet derived"', async () => {
    aiMock.generateText.mockResolvedValue({ output: { verdict: 'pursue_with_caveats', reasoning: 'x' }, usage: {} });
    await synthesizeVerdict({ painPointSummary: 'p', layerAResearch: null, layerBSignal: fakeStrongLayerB() });
    const callArgs = aiMock.generateText.mock.calls[0][0] as { messages: { content: string }[] };
    const msgs = callArgs.messages;
    expect(msgs[0].content).toContain('Layer A: not yet derived.');
  });

  it('handles a null Layer B by labeling it "no community responses captured yet"', async () => {
    aiMock.generateText.mockResolvedValue({ output: { verdict: 'pursue_with_caveats', reasoning: 'x' }, usage: {} });
    await synthesizeVerdict({ painPointSummary: 'p', layerAResearch: fakeLayerA(), layerBSignal: null });
    const callArgs = aiMock.generateText.mock.calls[0][0] as { messages: { content: string }[] };
    const msgs = callArgs.messages;
    expect(msgs[0].content).toContain('Layer B: no community responses captured yet.');
  });

  it('renders Layer B aggregate counts into the prompt verbatim', async () => {
    aiMock.generateText.mockResolvedValue({ output: { verdict: 'pursue', reasoning: 'x' }, usage: {} });
    await synthesizeVerdict({ painPointSummary: 'p', layerAResearch: fakeLayerA(), layerBSignal: fakeStrongLayerB() });
    const callArgs = aiMock.generateText.mock.calls[0][0] as { messages: { content: string }[] };
    const msgs = callArgs.messages;
    expect(msgs[0].content).toContain('validationStrength: strong');
    expect(msgs[0].content).toContain('positive=5, neutral=2, negative=1');
  });
});

describe('Synthesizer system-prompt invariants', () => {
  it('encodes the verdict ladder (pursue / pursue_with_caveats / drop)', () => {
    expect(__testInternals.SYNTHESIZER_SYSTEM_PROMPT).toContain('pursue');
    expect(__testInternals.SYNTHESIZER_SYSTEM_PROMPT).toContain('pursue_with_caveats');
    expect(__testInternals.SYNTHESIZER_SYSTEM_PROMPT).toContain('drop');
  });
  it("encodes the 'Layer B usually wins' tie-breaker", () => {
    expect(__testInternals.SYNTHESIZER_SYSTEM_PROMPT).toContain('Layer B usually wins');
  });
  it('forbids web search inside the synthesizer', () => {
    expect(__testInternals.SYNTHESIZER_SYSTEM_PROMPT).toContain('YOU DO NOT WEB-SEARCH');
  });
});
