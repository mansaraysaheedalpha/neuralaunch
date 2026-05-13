// src/lib/ideation/stage2-requirements/extractor.test.ts
//
// Unit tests for the pure narrowing logic of extractAndPlanStage2.
// The actual LLM call is not exercised here — that's covered by
// shape contract via the Zod schema in extractor.ts. What this
// tests is the post-parse invariant enforcement:
//
//   - action='recommend' without a recommendedAction → downgraded to 'ground'
//   - action !== 'recommend' → recommendedAction nulled
//   - confidence values clamped to [0, 1]

import { describe, it, expect, vi } from 'vitest';

// The extractor source-file starts with `import 'server-only'` AND
// imports `renderUserContent` from `@/lib/validation/server-helpers`
// — that pulls in next-auth via the auth() side-effect, which won't
// resolve under vitest. We exercise only the pure
// `narrowExtractAndPlanResult` helper here, so no-op stubs are enough.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown) =>
    typeof s === 'string' && s.length > 0 ? `[[[${s}]]]` : '[[[EMPTY]]]',
}));

import { narrowExtractAndPlanResult } from './extractor';
import type { ExtractAndPlanStage2Raw } from './extractor';

function rawBase(over: Partial<ExtractAndPlanStage2Raw> = {}): ExtractAndPlanStage2Raw {
  return {
    inputType:         'answer',
    skillUpdates:      [],
    teamMentions:      [],
    agentMove:         'probe',
    recommendedAction: null,
    readyToCompose:    false,
    driftDetected:     false,
    ...over,
  };
}

describe('narrowExtractAndPlanResult — action/payload invariant', () => {
  it("downgrades agentMove='recommend' to 'ground' when recommendedAction is null", () => {
    const result = narrowExtractAndPlanResult(rawBase({
      agentMove:         'recommend',
      recommendedAction: null,
    }));
    expect(result.agentMove).toBe('ground');
    expect(result.recommendedAction).toBe(null);
  });

  it("preserves 'recommend' move when a recommendedAction is present", () => {
    const result = narrowExtractAndPlanResult(rawBase({
      agentMove:         'recommend',
      recommendedAction: { action: 'talk to three customers', severity: 'suggested' },
    }));
    expect(result.agentMove).toBe('recommend');
    expect(result.recommendedAction).toEqual({
      action:   'talk to three customers',
      severity: 'suggested',
    });
  });

  it("nulls recommendedAction when agentMove is not 'recommend' (even if the model included one)", () => {
    const result = narrowExtractAndPlanResult(rawBase({
      agentMove:         'probe',
      recommendedAction: { action: 'stray', severity: 'suggested' },
    }));
    expect(result.recommendedAction).toBe(null);
  });

  it.each(['probe', 'ground', 'soft_close'] as const)(
    "leaves non-recommend move '%s' untouched and nulls action",
    (move) => {
      const result = narrowExtractAndPlanResult(rawBase({
        agentMove:         move,
        recommendedAction: null,
      }));
      expect(result.agentMove).toBe(move);
      expect(result.recommendedAction).toBe(null);
    },
  );
});

describe('narrowExtractAndPlanResult — confidence clamping', () => {
  it('clamps over-range confidence to 1', () => {
    const result = narrowExtractAndPlanResult(rawBase({
      skillUpdates: [
        { person: 'founder', skill: 'sales', tier: 'good', confidence: 1.7 },
      ],
    }));
    expect(result.skillUpdates[0].confidence).toBe(1);
  });

  it('clamps negative confidence to 0', () => {
    const result = narrowExtractAndPlanResult(rawBase({
      skillUpdates: [
        { person: 'founder', skill: 'sales', tier: 'good', confidence: -0.3 },
      ],
    }));
    expect(result.skillUpdates[0].confidence).toBe(0);
  });

  it('clamps NaN to 0', () => {
    const result = narrowExtractAndPlanResult(rawBase({
      skillUpdates: [
        { person: 'founder', skill: 'sales', tier: 'good', confidence: Number.NaN },
      ],
    }));
    expect(result.skillUpdates[0].confidence).toBe(0);
  });

  it('passes valid confidence through untouched', () => {
    const result = narrowExtractAndPlanResult(rawBase({
      skillUpdates: [
        { person: 'founder', skill: 'sales', tier: 'good', confidence: 0.7 },
      ],
    }));
    expect(result.skillUpdates[0].confidence).toBe(0.7);
  });
});

describe('narrowExtractAndPlanResult — passthrough fields', () => {
  it('preserves teamMentions verbatim', () => {
    const result = narrowExtractAndPlanResult(rawBase({
      teamMentions: [{ name: 'Maya' }, { name: 'Tom' }],
    }));
    expect(result.teamMentions).toEqual([{ name: 'Maya' }, { name: 'Tom' }]);
  });

  it('passes inputType / readyToCompose / driftDetected through', () => {
    const result = narrowExtractAndPlanResult(rawBase({
      inputType:      'synthesis_request',
      readyToCompose: true,
      driftDetected:  true,
    }));
    expect(result.inputType).toBe('synthesis_request');
    expect(result.readyToCompose).toBe(true);
    expect(result.driftDetected).toBe(true);
  });
});
