// src/lib/ideation/stage3-opportunities/score-pushback.test.ts
//
// Unit tests for the pure score-mutation rules of the per-pain-point
// pushback engine. The two LLM phases (Opus reasoning, Sonnet emit)
// are contract-bound by Zod schemas — what this tests is the action
// -> score-shape rules: refine merges non-null fields, replace fully
// replaces, defend / continue_dialogue / closing leave scores alone.

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown) =>
    typeof s === 'string' && s.length > 0 ? `[[[${s}]]]` : '[[[EMPTY]]]',
}));

import {
  applyScoreMutation,
  type ScoreRefinement,
  type ScoreReplacement,
} from './score-pushback';
import type { AgentSuggestedScores } from './schema';

function scores(over: Partial<AgentSuggestedScores> = {}): AgentSuggestedScores {
  return {
    intensity:          3,
    frequency:          3,
    nicheSpecificity:   3,
    reasoningPerMetric: 'initial',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// defend / continue_dialogue / closing — scores unchanged
// ---------------------------------------------------------------------------

describe('applyScoreMutation — non-mutating actions', () => {
  it.each(['defend', 'continue_dialogue', 'closing'] as const)(
    "leaves scores unchanged for action='%s'",
    (action) => {
      const prior = scores();
      const next = applyScoreMutation(prior, action, null, null);
      expect(next).toEqual(prior);
    },
  );

  it("ignores refinement / replacement payloads alongside a non-mutating action", () => {
    const prior = scores();
    const refinement: ScoreRefinement = {
      intensity: 5, frequency: null, nicheSpecificity: null, reasoningPerMetric: null,
    };
    const replacement: ScoreReplacement = {
      intensity: 1, frequency: 1, nicheSpecificity: 1, reasoningPerMetric: 'wiped',
    };
    expect(applyScoreMutation(prior, 'defend', refinement, replacement)).toEqual(prior);
  });
});

// ---------------------------------------------------------------------------
// refine — merges non-null fields
// ---------------------------------------------------------------------------

describe("applyScoreMutation — action='refine'", () => {
  it('merges only the non-null refinement fields', () => {
    const prior = scores();
    const refinement: ScoreRefinement = {
      intensity:          5,
      frequency:          null,
      nicheSpecificity:   null,
      reasoningPerMetric: null,
    };
    const next = applyScoreMutation(prior, 'refine', refinement, null);
    expect(next).toEqual({
      ...prior,
      intensity: 5,
    });
  });

  it('refines multiple fields at once', () => {
    const prior = scores();
    const refinement: ScoreRefinement = {
      intensity: 4, frequency: 5, nicheSpecificity: null, reasoningPerMetric: 'new reasoning',
    };
    const next = applyScoreMutation(prior, 'refine', refinement, null);
    expect(next).toEqual({
      intensity: 4, frequency: 5, nicheSpecificity: 3, reasoningPerMetric: 'new reasoning',
    });
  });

  it("falls through to non-mutating behaviour when refinement is null", () => {
    const prior = scores();
    expect(applyScoreMutation(prior, 'refine', null, null)).toEqual(prior);
  });

  it("falls through to non-mutating behaviour when prior is null (founder pain point)", () => {
    expect(applyScoreMutation(null, 'refine', {
      intensity: 5, frequency: null, nicheSpecificity: null, reasoningPerMetric: null,
    }, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// replace — full rewrite of agentSuggestedScores
// ---------------------------------------------------------------------------

describe("applyScoreMutation — action='replace'", () => {
  it('fully replaces prior scores', () => {
    const prior = scores();
    const replacement: ScoreReplacement = {
      intensity: 1, frequency: 2, nicheSpecificity: 4, reasoningPerMetric: 'replaced reasoning',
    };
    const next = applyScoreMutation(prior, 'replace', null, replacement);
    expect(next).toEqual(replacement);
  });

  it("falls through to non-mutating when replacement is null", () => {
    const prior = scores();
    expect(applyScoreMutation(prior, 'replace', null, null)).toEqual(prior);
  });

  it("replaces against a null prior (agent surfaces scores for the first time)", () => {
    const replacement: ScoreReplacement = {
      intensity: 4, frequency: 4, nicheSpecificity: 4, reasoningPerMetric: 'fresh',
    };
    expect(applyScoreMutation(null, 'replace', null, replacement)).toEqual(replacement);
  });
});
