// src/lib/ideation/stage4-opportunities/layer-b-script-agent.test.ts
//
// Layer B test-script generator contract tests. Mocked at the AI SDK
// boundary so no real model calls fire.

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

import { runLayerBScript, __testInternals } from './layer-b-script-agent';
import type { OutcomeDocument } from '../stage1-outcome/schema';
import type { LayerAResearch } from './schema';

interface FallbackConfig { primary: string; fallback: string }
type Runner = (modelId: string) => Promise<unknown>;

function fakeOutcome(): OutcomeDocument {
  return {
    dimensions: {
      timeHorizon:         { value: '6-18mo',          confidence: 0.8, extractedAt: null },
      financialGoal:       { value: { shape: 'side_income', target: '$2k/mo' }, confidence: 0.8, extractedAt: null },
      riskTolerance:       { value: 'moderate',        confidence: 0.8, extractedAt: null },
      lifestylePreference: { value: 'side_hustle',     confidence: 0.8, extractedAt: null },
    },
    synthesisParagraph: 'Side hustle at 2k/mo.',
    rulesOut:           'No venture scale.',
    recommendedActions: [],
  };
}

function fakeLayerA(): LayerAResearch {
  return {
    marketReality:  { reasoning: 'r1', citations: [], confidence: 0.7 },
    customerAccess: { reasoning: 'r2', citations: [], confidence: 0.6 },
    willPeoplePay:  { reasoning: 'r3', citations: [], confidence: 0.5 },
    marketSize:     { reasoning: 'r4', citations: [], confidence: 0.4 },
    researchedAt:   '2026-05-15T10:00:00.000Z',
  };
}

function fakeScriptOutput() {
  return {
    platforms:      ['r/smallbusiness', 'Indie Hackers'],
    postWording:    'I keep running into X. Has anyone hit this?',
    questionsToAsk: ['How often does this hit you?', 'What do you do today instead?'],
    generatedAt:    '2026-05-15T10:00:00.000Z',
  };
}

beforeEach(() => {
  aiMock.generateText.mockReset();
  fallbackMock.withModelFallback.mockReset();
  fallbackMock.withModelFallback.mockImplementation(
    async (_callsite: string, config: FallbackConfig, run: Runner) => run(config.primary),
  );
});

describe('runLayerBScript', () => {
  it('uses Sonnet primary + Haiku fallback', async () => {
    aiMock.generateText.mockResolvedValue({ output: fakeScriptOutput(), usage: {} });
    await runLayerBScript({
      painPointSummary: 'p',
      layerAResearch:   fakeLayerA(),
      outcomeDocument:  fakeOutcome(),
    });
    const cfg = fallbackMock.withModelFallback.mock.calls[0][1] as FallbackConfig;
    expect(cfg.primary).toBe('claude-sonnet-4-6');
    expect(cfg.fallback).toBe('claude-haiku-4-5-20251001');
  });

  it('passes Layer A findings into the prompt when present', async () => {
    aiMock.generateText.mockResolvedValue({ output: fakeScriptOutput(), usage: {} });
    await runLayerBScript({
      painPointSummary: 'p',
      layerAResearch:   fakeLayerA(),
      outcomeDocument:  fakeOutcome(),
    });
    const callArgs = aiMock.generateText.mock.calls[0][0] as { messages: { content: string }[] };
    const messages = callArgs.messages;
    expect(messages[0].content).toContain('Layer A research findings:');
    expect(messages[0].content).toContain('Market Reality:');
  });

  it('falls through to a derive-from-pain-only frame when Layer A is null', async () => {
    aiMock.generateText.mockResolvedValue({ output: fakeScriptOutput(), usage: {} });
    await runLayerBScript({
      painPointSummary: 'p',
      layerAResearch:   null,
      outcomeDocument:  fakeOutcome(),
    });
    const callArgs = aiMock.generateText.mock.calls[0][0] as { messages: { content: string }[] };
    const messages = callArgs.messages;
    expect(messages[0].content).toContain('No Layer A research run yet');
  });

  it('stamps generatedAt server-side when the model emits an invalid timestamp', async () => {
    aiMock.generateText.mockResolvedValue({
      output: { ...fakeScriptOutput(), generatedAt: 'garbage' },
      usage: {},
    });
    const script = await runLayerBScript({
      painPointSummary: 'p', layerAResearch: fakeLayerA(), outcomeDocument: fakeOutcome(),
    });
    expect(new Date(script.generatedAt).toString()).not.toBe('Invalid Date');
    expect(script.generatedAt).not.toBe('garbage');
  });
});

describe('Layer B system-prompt invariants — load-bearing policy', () => {
  it('enforces the founder-posts-personally policy verbatim', () => {
    const p = __testInternals.LAYER_B_SYSTEM_PROMPT;
    expect(p).toContain('founder posts this PERSONALLY');
    expect(p).toContain('never automate');
    expect(p).toContain('never impersonate');
  });
  it('forbids pitch language in the post wording', () => {
    expect(__testInternals.LAYER_B_SYSTEM_PROMPT).toContain('Forbidden: pitch language');
  });
  it('requires platforms[] to be specific, not generic', () => {
    expect(__testInternals.LAYER_B_SYSTEM_PROMPT).toContain('specific, named, identifiable');
  });
});
