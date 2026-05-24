// src/lib/ideation/stage5-handoff/__tests__/reserve-builder.test.ts
//
// Pure-function tests for the reserve ranking heuristic. No LLM,
// no DB. Verifies the brief's contract: "picks the 4 non-chosen
// opportunities; preserves enough context for the continuation
// brief to surface them meaningfully."

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildReserveOpportunities, __testInternals } from '../reserve-builder';
import type { OpportunityEvaluation } from '../../stage4-opportunities/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkOpp(input: {
  id: string;
  agent?:    'pursue' | 'pursue_with_caveats' | 'drop' | 'pending';
  founder?:  'pursue' | 'pursue_with_caveats' | 'drop' | null;
  strength?: 'strong' | 'mixed' | 'weak' | 'contradictory';
}): OpportunityEvaluation {
  return {
    id:                    input.id,
    painPointId:           `pp_${input.id}`,
    painPointSummary:      `pain for ${input.id}`,
    layerAResearch:        null,
    layerBScript:          null,
    layerBResponses:       [],
    layerBExtractedSignal: input.strength ? {
      validationStrength:   input.strength,
      sentimentBreakdown:   { positive: 0, neutral: 0, negative: 0 },
      keyQuotes:            [],
      contradictionsRaised: [],
    } : null,
    agentVerdict:          input.agent   ?? 'pursue',
    agentReasoning:        'agent reasoning',
    founderVerdict:        input.founder === undefined ? null : input.founder,
    pushbackHistory:       [],
    pushbackVersion:       0,
    status:                'evaluated',
  };
}

// ---------------------------------------------------------------------------
// buildReserveOpportunities — output bounds + filtering
// ---------------------------------------------------------------------------

describe('buildReserveOpportunities', () => {
  it('filters out the chosen opportunity', () => {
    const opps = ['a', 'b', 'c'].map(id => mkOpp({ id, founder: 'pursue_with_caveats' }));
    const reserves = buildReserveOpportunities(opps, 'b');
    expect(reserves.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it("returns [] when there's only the chosen opportunity", () => {
    expect(buildReserveOpportunities([mkOpp({ id: 'only' })], 'only')).toEqual([]);
  });

  it('returns [] when the input list is empty', () => {
    expect(buildReserveOpportunities([], 'nothing')).toEqual([]);
  });

  it('caps the output at 4 entries (MAX_RESERVE_OPPORTUNITIES)', () => {
    // Six opps, one chosen → five non-chosen; expect bounded to 4.
    const opps = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => mkOpp({ id, founder: 'pursue' }));
    const reserves = buildReserveOpportunities(opps, 'a');
    expect(reserves).toHaveLength(4);
  });

  it('assigns positional rank starting at 1', () => {
    const opps = ['x', 'y', 'z'].map(id => mkOpp({ id, founder: 'pursue' }));
    const reserves = buildReserveOpportunities(opps, 'x');
    expect(reserves[0].rank).toBe(1);
    expect(reserves[1].rank).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Ranking heuristic — fork-surfacing order
// ---------------------------------------------------------------------------

describe('reserve ranking heuristic', () => {
  it('ranks pursue above pursue_with_caveats', () => {
    const opps = [
      mkOpp({ id: 'caveats', founder: 'pursue_with_caveats' }),
      mkOpp({ id: 'pursue',  founder: 'pursue' }),
    ];
    const reserves = buildReserveOpportunities([...opps, mkOpp({ id: 'chosen' })], 'chosen');
    expect(reserves[0].id).toBe('pursue');
    expect(reserves[1].id).toBe('caveats');
  });

  it('ranks unset-verdict (null) above founder-rejected (drop)', () => {
    // An opp the founder never explicitly verdict'd is more useful
    // as a fork than one they actively dropped.
    const reserves = buildReserveOpportunities([
      mkOpp({ id: 'dropped', founder: 'drop' }),
      mkOpp({ id: 'unset',   founder: null }),
      mkOpp({ id: 'chosen'                 }),
    ], 'chosen');
    expect(reserves[0].id).toBe('unset');
    expect(reserves[1].id).toBe('dropped');
  });

  it('tanks the rank when Layer B signal is contradictory', () => {
    const reserves = buildReserveOpportunities([
      mkOpp({ id: 'contra', founder: 'pursue_with_caveats', strength: 'contradictory' }),
      mkOpp({ id: 'mixed',  founder: 'pursue_with_caveats', strength: 'mixed' }),
      mkOpp({ id: 'chosen'                                                    }),
    ], 'chosen');
    expect(reserves[0].id).toBe('mixed');
    expect(reserves[1].id).toBe('contra');
  });

  it('rank function returns higher score for stronger Layer B', () => {
    const strongOpp = mkOpp({ id: 's', founder: 'pursue', strength: 'strong' });
    const weakOpp   = mkOpp({ id: 'w', founder: 'pursue', strength: 'weak'   });
    expect(__testInternals.rankReserveCandidate(strongOpp))
      .toBeGreaterThan(__testInternals.rankReserveCandidate(weakOpp));
  });
});

// ---------------------------------------------------------------------------
// Snapshot shape — denormalised context for the continuation brief
// ---------------------------------------------------------------------------

describe('reserve snapshot shape', () => {
  it('carries the pain summary + agent reasoning verbatim (decision context for the brief)', () => {
    const opps = [
      mkOpp({ id: 'a', founder: 'pursue' }),
      mkOpp({ id: 'chosen' }),
    ];
    const [r] = buildReserveOpportunities(opps, 'chosen');
    expect(r.painPointSummary).toBe('pain for a');
    expect(r.agentReasoning).toBe('agent reasoning');
    expect(r.agentVerdict).toBe('pursue');
    expect(r.founderVerdict).toBe('pursue');
  });

  it('preserves the layerBSummary aggregate when present', () => {
    const opps = [
      mkOpp({ id: 'a', founder: 'pursue', strength: 'strong' }),
      mkOpp({ id: 'chosen' }),
    ];
    const [r] = buildReserveOpportunities(opps, 'chosen');
    expect(r.layerBSummary?.validationStrength).toBe('strong');
  });

  it('layerASummary stays null when Stage 4 never ran research on this opp', () => {
    const opps = [
      mkOpp({ id: 'a', founder: 'pursue' }), // no layerAResearch in the fixture
      mkOpp({ id: 'chosen' }),
    ];
    const [r] = buildReserveOpportunities(opps, 'chosen');
    expect(r.layerASummary).toBeNull();
  });
});
