// src/lib/ideation/stage3-opportunities/extractor.test.ts
//
// Tests the pure narrowExtractAndPlanStage3Result transformer. The
// LLM call shape is contract-bound by ExtractAndPlanStage3Schema in
// extractor.ts; what this verifies is the action-invariant coercion:
//
//   - recommend without a recommendedAction → ground (no orphaned recs)
//   - non-recommend move with a recommendedAction → strip the payload
//
// Mirrors Stage 2's extractor.test.ts narrowing tests.

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown) =>
    typeof s === 'string' && s.length > 0 ? `[[[${s}]]]` : '[[[EMPTY]]]',
}));

import {
  narrowExtractAndPlanStage3Result,
  type ExtractAndPlanStage3Raw,
} from './extractor';

function raw(over: Partial<ExtractAndPlanStage3Raw> = {}): ExtractAndPlanStage3Raw {
  return {
    inputType:         'answer',
    founderPainPoints: [],
    agentMove:         'probe',
    recommendedAction: null,
    readyToCompose:    false,
    driftDetected:     false,
    ...over,
  };
}

describe('narrowExtractAndPlanStage3Result', () => {
  it("downgrades 'recommend' with no recommendedAction to 'ground'", () => {
    const out = narrowExtractAndPlanStage3Result(raw({
      agentMove:         'recommend',
      recommendedAction: null,
    }));
    expect(out.agentMove).toBe('ground');
    expect(out.recommendedAction).toBeNull();
  });

  it("keeps 'recommend' when recommendedAction is provided", () => {
    const out = narrowExtractAndPlanStage3Result(raw({
      agentMove:         'recommend',
      recommendedAction: { action: 'talk to 5 people', severity: 'suggested' },
    }));
    expect(out.agentMove).toBe('recommend');
    expect(out.recommendedAction).toEqual({ action: 'talk to 5 people', severity: 'suggested' });
  });

  it("strips recommendedAction from non-recommend moves", () => {
    const out = narrowExtractAndPlanStage3Result(raw({
      agentMove:         'soft_close',
      recommendedAction: { action: 'orphaned', severity: 'suggested' },
    }));
    expect(out.recommendedAction).toBeNull();
  });

  it("passes through founderPainPoints + flags untouched", () => {
    const out = narrowExtractAndPlanStage3Result(raw({
      inputType: 'frustrated',
      founderPainPoints: [
        { description: 'I hate X', founderContext: 'own_life', founderNotes: null },
      ],
      readyToCompose: true,
      driftDetected:  true,
    }));
    expect(out.inputType).toBe('frustrated');
    expect(out.founderPainPoints).toHaveLength(1);
    expect(out.readyToCompose).toBe(true);
    expect(out.driftDetected).toBe(true);
  });
});
