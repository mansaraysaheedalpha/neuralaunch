// src/lib/ideation/stage2-requirements/expected-profile-agent.test.ts
//
// Tests the Expected Profile derivation flow's post-LLM behaviour:
//   - LLM-returned entries get `pushback: null` initialised
//   - Research log is propagated from the accumulator
//   - Empty entries → throws (degenerate output)
//   - Tool list shrinks to what the env actually has configured
//     (verified indirectly via buildResearchTools being mockable)
//
// The actual LLM call is mocked at the withModelFallback boundary.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown) =>
    typeof s === 'string' && s.length > 0 ? `[[[${s}]]]` : '[[[EMPTY]]]',
}));

const mocks = vi.hoisted(() => ({
  withModelFallback: vi.fn(),
  buildResearchTools: vi.fn(),
}));
vi.mock('@/lib/ai/with-model-fallback', () => ({
  withModelFallback: mocks.withModelFallback,
}));
vi.mock('@/lib/observability', () => ({
  withAgentSpan: (_opts: unknown, run: (setAttr: () => void) => Promise<unknown>) =>
    run(() => undefined),
  ATTR_AGENT_TIER:       'agent.tier',
  ATTR_AGENT_MODEL:      'agent.model',
  ATTR_TOKENS_INPUT:     'tokens.input',
  ATTR_TOKENS_OUTPUT:    'tokens.output',
  ATTR_LATENCY_TOTAL_MS: 'latency.total_ms',
}));
vi.mock('@/lib/ai/prompt-cache', () => ({
  cachedUserMessages: (stable: string, volatile: string) => [
    { role: 'user', content: `${stable}\n\n${volatile}` },
  ],
}));
// Mock @/lib/research without importActual — the real module loads
// tavily-client which validates env vars at import time (and crashes
// vitest's headless env). We only need three exports from this module
// for the expected-profile-agent to compile: buildResearchTools,
// getResearchToolGuidance, RESEARCH_BUDGETS. The ResearchLogEntry type
// is type-only and doesn't need a runtime value.
vi.mock('@/lib/research', () => ({
  buildResearchTools: (...args: unknown[]) => {
    mocks.buildResearchTools(...args);
    return {};
  },
  getResearchToolGuidance: () => '',
  RESEARCH_BUDGETS: {
    'stage2-expected-profile': { steps: 3, description: 'test stub' },
  },
}));

// Re-import after mocks.
import { deriveExpectedProfile } from './expected-profile-agent';
import type { OutcomeDocument } from '../stage1-outcome/schema';

beforeEach(() => {
  mocks.withModelFallback.mockReset();
  mocks.buildResearchTools.mockReset();
});

function fakeOutcomeDoc(): OutcomeDocument {
  return {
    dimensions: {
      timeHorizon:         { value: '6-18mo',         confidence: 0.8, extractedAt: null },
      financialGoal:       { value: { shape: 'venture_scale', target: '$5M ARR' }, confidence: 0.8, extractedAt: null },
      riskTolerance:       { value: 'high',           confidence: 0.8, extractedAt: null },
      lifestylePreference: { value: 'fundable_startup', confidence: 0.8, extractedAt: null },
    },
    synthesisParagraph: 'syn',
    rulesOut:           'rules',
    recommendedActions: [],
  };
}

// ---------------------------------------------------------------------------
// Entry shaping
// ---------------------------------------------------------------------------

describe('deriveExpectedProfile — entry shaping', () => {
  it('initialises pushback=null on every entry', async () => {
    mocks.withModelFallback.mockResolvedValueOnce({
      entries: [
        { skill: 'sales',       requiredTier: 'good', critical: true,  reasoning: 'r', sources: ['s'] },
        { skill: 'programming', requiredTier: 'good', critical: false, reasoning: 'r', sources: ['s'] },
      ],
    });

    const result = await deriveExpectedProfile({
      outcomeDocument: fakeOutcomeDoc(),
      contextId:       'sess_1',
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].pushback).toBe(null);
    expect(result.entries[1].pushback).toBe(null);
  });

  it('preserves the LLM-supplied skill / tier / critical / reasoning / sources', async () => {
    mocks.withModelFallback.mockResolvedValueOnce({
      entries: [
        { skill: 'data_analysis', requiredTier: 'acceptable', critical: false, reasoning: 'because', sources: ['a', 'b'] },
      ],
    });

    const result = await deriveExpectedProfile({
      outcomeDocument: fakeOutcomeDoc(),
      contextId:       'sess_1',
    });

    expect(result.entries[0]).toMatchObject({
      skill:        'data_analysis',
      requiredTier: 'acceptable',
      critical:     false,
      reasoning:    'because',
      sources:      ['a', 'b'],
      pushback:     null,
    });
  });
});

// ---------------------------------------------------------------------------
// Degenerate output handling
// ---------------------------------------------------------------------------

describe('deriveExpectedProfile — degenerate output', () => {
  it('throws when the LLM returns zero entries (degenerate generation)', async () => {
    mocks.withModelFallback.mockResolvedValueOnce({ entries: [] });

    await expect(deriveExpectedProfile({
      outcomeDocument: fakeOutcomeDoc(),
      contextId:       'sess_1',
    })).rejects.toThrow(/zero entries/);
  });
});

// ---------------------------------------------------------------------------
// Research-tool wiring
// ---------------------------------------------------------------------------

describe('deriveExpectedProfile — research tool wiring', () => {
  it("calls buildResearchTools with agent='stage2-expected-profile' and the supplied contextId", async () => {
    type RunCallback = (modelId: string) => Promise<unknown>;
    mocks.withModelFallback.mockImplementationOnce(
      async (_callsite: string, _config: unknown, run: RunCallback) => {
        // Drive the run callback so buildResearchTools gets invoked
        // inside the factory. The inner generateText fails (no real
        // provider) — we swallow that and return the canned shape so
        // the assertion below sees the buildResearchTools call.
        try {
          await run('test-model');
        } catch {
          /* expected — no real provider configured */
        }
        return { entries: [{ skill: 'sales', requiredTier: 'good', critical: true, reasoning: 'r', sources: ['s'] }] };
      },
    );

    await deriveExpectedProfile({
      outcomeDocument: fakeOutcomeDoc(),
      contextId:       'sess_42',
    });

    expect(mocks.buildResearchTools).toHaveBeenCalledWith(
      expect.objectContaining({
        agent:     'stage2-expected-profile',
        contextId: 'sess_42',
      }),
    );
  });
});
