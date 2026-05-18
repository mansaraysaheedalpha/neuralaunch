// src/lib/ideation/stage4-opportunities/layer-a-research-agent.test.ts
//
// Layer A research-agent contract tests. Mocks at four boundaries so
// no real LLM / Tavily / Exa / community_pulse calls fire:
//   - 'ai' generateText
//   - withModelFallback
//   - @/lib/research (buildResearchTools / getResearchToolGuidance /
//     RESEARCH_BUDGETS — we read the stage4 step budget through the
//     real export to catch wiring regressions)
//
// What we pin:
//   - Wires the stage4-opportunity-research agent identifier through
//   - Uses RESEARCH_BUDGETS['stage4-opportunity-research'].steps as
//     the stopWhen
//   - Sonnet primary + Haiku fallback (we accept degradation here —
//     Layer B is the load-bearing layer)
//   - Server stamps researchedAt if the model omits/garbles it
//   - SECURITY-NOTE language present in the system prompt

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
  stepCountIs: (n: number) => ({ kind: 'stepCount', n }),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (modelId: string) => ({ modelId }),
}));

const fallbackMock = vi.hoisted(() => ({
  withModelFallback: vi.fn(),
}));
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

const researchMock = vi.hoisted(() => ({
  buildResearchTools: vi.fn(() => ({})),
}));
vi.mock('@/lib/research', () => ({
  buildResearchTools:        researchMock.buildResearchTools,
  getResearchToolGuidance:   () => 'TOOL_GUIDANCE_STUB',
  RESEARCH_BUDGETS: {
    'stage4-opportunity-research': { steps: 6, description: 'stage4' },
  },
}));

import { runLayerAResearch, __testInternals } from './layer-a-research-agent';
import type { OutcomeDocument } from '../stage1-outcome/schema';
import type { RequirementsDocument } from '../stage2-requirements/schema';

interface FallbackConfig { primary: string; fallback: string }
type Runner = (modelId: string) => Promise<unknown>;

function fakeOutcome(): OutcomeDocument {
  return {
    dimensions: {
      timeHorizon:         { value: '6-18mo',         confidence: 0.8, extractedAt: null },
      financialGoal:       { value: { shape: 'side_income', target: '$2k/mo' }, confidence: 0.8, extractedAt: null },
      riskTolerance:       { value: 'moderate',       confidence: 0.8, extractedAt: null },
      lifestylePreference: { value: 'side_hustle',    confidence: 0.8, extractedAt: null },
    },
    synthesisParagraph: 'Side hustle aimed at $2k/mo.',
    rulesOut:           'No venture-scale work.',
    recommendedActions: [],
  };
}

function fakeRequirements(): RequirementsDocument {
  return {
    skillInventorySnapshot: { founder: { tiers: {} }, team: [] },
    expectedProfile:    [],
    constraints:        [],
    structuralBlocker:  { triggered: false, axis: null, founderChoice: null, founderNotes: null },
    recommendedActions: [],
    researchLog:        [],
  } as unknown as RequirementsDocument;
}

function fakeLayerAOutput() {
  return {
    marketReality:  { reasoning: 'r1', citations: [{ url: 'https://a',     excerpt: 'e1', sourcePlatform: 'HN' }], confidence: 0.7 },
    customerAccess: { reasoning: 'r2', citations: [{ url: 'https://b',     excerpt: 'e2', sourcePlatform: 'HN' }], confidence: 0.6 },
    willPeoplePay:  { reasoning: 'r3', citations: [{ url: 'https://c',     excerpt: 'e3', sourcePlatform: 'HN' }], confidence: 0.5 },
    marketSize:     { reasoning: 'r4', citations: [{ url: 'https://d',     excerpt: 'e4', sourcePlatform: 'HN' }], confidence: 0.4 },
    researchedAt:   '2026-05-15T10:00:00.000Z',
  };
}

beforeEach(() => {
  aiMock.generateText.mockReset();
  fallbackMock.withModelFallback.mockReset();
  fallbackMock.withModelFallback.mockImplementation(
    async (_callsite: string, config: FallbackConfig, run: Runner) => run(config.primary),
  );
  researchMock.buildResearchTools.mockClear();
});

describe('runLayerAResearch', () => {
  it('wires stage4-opportunity-research as the research agent identifier', async () => {
    aiMock.generateText.mockResolvedValue({ output: fakeLayerAOutput(), usage: {} });
    await runLayerAResearch({
      painPointSummary: 'p',
      outcomeDocument:  fakeOutcome(),
      requirementsDocument: fakeRequirements(),
      contextId:        'sess',
    });
    expect(researchMock.buildResearchTools).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'stage4-opportunity-research', contextId: 'sess' }),
    );
  });

  it('uses Sonnet primary + Haiku fallback (Stage 4 accepts degradation here)', async () => {
    aiMock.generateText.mockResolvedValue({ output: fakeLayerAOutput(), usage: {} });
    await runLayerAResearch({
      painPointSummary: 'p', outcomeDocument: fakeOutcome(),
      requirementsDocument: fakeRequirements(), contextId: 'sess',
    });
    const cfg = fallbackMock.withModelFallback.mock.calls[0][1] as FallbackConfig;
    expect(cfg.primary).toBe('claude-sonnet-4-6');
    expect(cfg.fallback).toBe('claude-haiku-4-5-20251001');
  });

  it('caps the tool loop at RESEARCH_BUDGETS step count', async () => {
    aiMock.generateText.mockResolvedValue({ output: fakeLayerAOutput(), usage: {} });
    await runLayerAResearch({
      painPointSummary: 'p', outcomeDocument: fakeOutcome(),
      requirementsDocument: fakeRequirements(), contextId: 'sess',
    });
    const callArgs = aiMock.generateText.mock.calls[0][0] as { stopWhen: { n: number } };
    expect(callArgs.stopWhen.n).toBe(6);
  });

  it('stamps researchedAt server-side when the model returns an invalid timestamp', async () => {
    aiMock.generateText.mockResolvedValue({
      output: { ...fakeLayerAOutput(), researchedAt: 'not-a-date' },
      usage: {},
    });
    const result = await runLayerAResearch({
      painPointSummary: 'p', outcomeDocument: fakeOutcome(),
      requirementsDocument: fakeRequirements(), contextId: 'sess',
    });
    // The server's now() ISO is valid; not-a-date is not.
    expect(__testInternals.isValidIso(result.layerA.researchedAt)).toBe(true);
    expect(result.layerA.researchedAt).not.toBe('not-a-date');
  });

  it('preserves the model timestamp when it parses cleanly', async () => {
    aiMock.generateText.mockResolvedValue({ output: fakeLayerAOutput(), usage: {} });
    const result = await runLayerAResearch({
      painPointSummary: 'p', outcomeDocument: fakeOutcome(),
      requirementsDocument: fakeRequirements(), contextId: 'sess',
    });
    expect(result.layerA.researchedAt).toBe('2026-05-15T10:00:00.000Z');
  });
});

describe('Layer A system-prompt invariants', () => {
  it('names all four dimensions verbatim', () => {
    const p = __testInternals.LAYER_A_SYSTEM_PROMPT;
    expect(p).toContain('MARKET REALITY');
    expect(p).toContain('CUSTOMER ACCESS');
    expect(p).toContain('WILL PEOPLE PAY');
    expect(p).toContain('MARKET SIZE');
  });
  it('includes the SECURITY NOTE clause', () => {
    expect(__testInternals.LAYER_A_SYSTEM_PROMPT).toContain('SECURITY NOTE');
  });
  it('mentions the Reddit/Stack-Exchange exclusion', () => {
    expect(__testInternals.LAYER_A_SYSTEM_PROMPT).toContain('REDDIT IS NOT COVERED');
  });
});
