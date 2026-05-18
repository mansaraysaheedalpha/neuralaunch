// src/lib/ideation/stage4-opportunities/composer.test.ts
//
// Composer invariants. The rationale-prose LLM call is mocked via
// withModelFallback so the test focuses on the deterministic
// orchestration:
//
//   - Throws below MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT
//   - Picks the chosen-#1 via aggregate.pickChosenOpportunity
//   - Output is a clean OpportunityEvaluationsDocument with
//     chosenOpportunityId matching the ranker

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/validation/server-helpers', () => {
  class HttpError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = 'HttpError';
    }
  }
  function renderUserContent(value: unknown, _maxLen?: number): string {
    const s = typeof value === 'string' ? value : String(value);
    return s ? `[[[${s}]]]` : '[[[EMPTY]]]';
  }
  return { HttpError, renderUserContent };
});

const mocks = vi.hoisted(() => ({
  withModelFallback: vi.fn(),
}));
vi.mock('@/lib/ai/with-model-fallback', () => ({
  withModelFallback: mocks.withModelFallback,
}));

vi.mock('@/lib/observability', () => ({
  withAgentSpan: (_opts: unknown, run: (setAttr: () => void) => Promise<unknown>) => run(() => undefined),
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

import { composeOpportunityEvaluationsDocument } from './composer';
import {
  createEmptyStage4AuthoringState,
  buildOpportunityEvaluation,
  appendOpportunity,
  applyAgentVerdict,
  applyFounderVerdict,
} from './state';
import type { Stage4AuthoringState } from './schema';

beforeEach(() => {
  mocks.withModelFallback.mockReset();
  mocks.withModelFallback.mockResolvedValue({
    chosenRationale:   'stub chosen rationale paragraph.',
    rejectedRationale: 'stub rejected rationale paragraph.',
  });
});

function evaluated(id: string, agent: 'pursue' | 'pursue_with_caveats', founder: 'pursue' | 'pursue_with_caveats' | 'drop') {
  return applyFounderVerdict(applyAgentVerdict(buildOpportunityEvaluation({ painPointId: id, painPointSummary: id }), agent, 'r'), founder);
}

describe('composeOpportunityEvaluationsDocument', () => {
  it('throws when no opportunity has a non-drop founder verdict (below floor)', async () => {
    const s: Stage4AuthoringState = createEmptyStage4AuthoringState();
    await expect(composeOpportunityEvaluationsDocument({ state: s })).rejects.toThrow(/Cannot compose/);
  });

  it('returns a clean document with chosenOpportunityId matching the ranker', async () => {
    let s = createEmptyStage4AuthoringState();
    s = appendOpportunity(s, evaluated('aaa', 'pursue',              'pursue'));
    s = appendOpportunity(s, evaluated('bbb', 'pursue_with_caveats', 'pursue_with_caveats'));

    const doc = await composeOpportunityEvaluationsDocument({ state: s });

    // pursue (with alignment bonus) wins over pursue_with_caveats.
    expect(doc.chosenOpportunityId).toBe(s.opportunities.find(o => o.painPointId === 'aaa')!.id);
    expect(doc.evaluations).toHaveLength(2);
    expect(doc.chosenRationale).toBe('stub chosen rationale paragraph.');
    expect(doc.rejectedRationale).toBe('stub rejected rationale paragraph.');
    expect(doc.composedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('skips dropped opportunities when picking the chosen #1', async () => {
    let s = createEmptyStage4AuthoringState();
    s = appendOpportunity(s, evaluated('dropped', 'pursue', 'drop'));
    s = appendOpportunity(s, evaluated('keep',    'pursue_with_caveats', 'pursue_with_caveats'));

    const doc = await composeOpportunityEvaluationsDocument({ state: s });
    expect(doc.chosenOpportunityId).toBe(s.opportunities.find(o => o.painPointId === 'keep')!.id);
  });
});
