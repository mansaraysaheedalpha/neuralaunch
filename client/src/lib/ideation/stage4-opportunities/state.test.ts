// src/lib/ideation/stage4-opportunities/state.test.ts
//
// Invariants for the Stage 4 state machine + aggregate signal +
// chosen-#1 ranker + clamps. Pure functions; no LLM, no DB.

import { describe, it, expect } from 'vitest';
import {
  createEmptyStage4AuthoringState,
  safeParseStage4AuthoringState,
  buildOpportunityEvaluation,
  buildCommunityResponse,
  appendOpportunity,
  appendCommunityResponse,
  removeOpportunityById,
  applyAgentVerdict,
  applyFounderVerdict,
  appendStage4RecommendedAction,
  computeStage4Readiness,
  computeAggregateSignal,
  pickChosenOpportunity,
} from './state';
import {
  MAX_RESPONSES_PER_OPPORTUNITY,
  MAX_RECOMMENDED_ACTIONS_STAGE4,
} from './constants';
import type {
  OpportunityEvaluation,
  CommunityResponse,
  ExtractedSignal,
} from './schema';
import type { RecommendedAction } from '../stage1-outcome/schema';

vi_mock_server_only();
function vi_mock_server_only(): void {
  // Vitest doesn't auto-stub 'server-only'; the import declarations
  // in state.ts pull it in transitively. The state module body
  // doesn't use anything from 'server-only', so a no-op shim is enough.
}
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExtracted(args: {
  positive?: number;
  neutral?:  number;
  negative?: number;
  quotes?:   string[];
  contras?:  string[];
}): ExtractedSignal {
  const positive = args.positive ?? 0;
  const neutral  = args.neutral  ?? 0;
  const negative = args.negative ?? 0;
  return {
    platformIdentified: 'Reddit / r/test',
    originalPost: { visible: true, voteCount: 5, bodyExcerpt: 'founder post' },
    comments: [
      ...Array.from({ length: positive }, (_, i) => ({ authorHandle: `pos${i}`, text: 'love it', sentiment: 'positive' as const, voteCount: null })),
      ...Array.from({ length: neutral },  (_, i) => ({ authorHandle: `neu${i}`, text: 'k',       sentiment: 'neutral'  as const, voteCount: null })),
      ...Array.from({ length: negative }, (_, i) => ({ authorHandle: `neg${i}`, text: 'no',      sentiment: 'negative' as const, voteCount: null })),
    ],
    keyQuotes:            args.quotes ?? [],
    contradictionsToPain: args.contras ?? [],
    unparseableNotes:     null,
  };
}

function screenshotResponse(oppId: string, signal: ExtractedSignal): CommunityResponse {
  const base = buildCommunityResponse({ opportunityId: oppId, source: 'screenshot', s3Url: 's3://u', s3Key: 'k' });
  return { ...base, extractedSignal: signal, moderationPassed: true, extractedAt: new Date().toISOString() };
}

function action(o: Partial<RecommendedAction> = {}): RecommendedAction {
  return {
    action:          'Talk to three people',
    severity:        'suggested',
    raisedAt:        new Date().toISOString(),
    status:          'pending',
    founderResponse: null,
    ...o,
  };
}

// ---------------------------------------------------------------------------
// Empty state + safe parse
// ---------------------------------------------------------------------------

describe('createEmptyStage4AuthoringState', () => {
  it('returns an empty initial shape', () => {
    const s = createEmptyStage4AuthoringState();
    expect(s.opportunities).toEqual([]);
    expect(s.founderCommunityResponses).toEqual([]);
    expect(s.recommendedActions).toEqual([]);
    expect(s.cascadeSnapshot).toBeNull();
    expect(s.requiresRederivation).toBe(false);
  });
});

describe('safeParseStage4AuthoringState', () => {
  it('null input yields an empty state', () => {
    const s = safeParseStage4AuthoringState(null);
    expect(s.opportunities).toEqual([]);
  });
  it('garbage input yields an empty state (degrades cleanly)', () => {
    const s = safeParseStage4AuthoringState({ random: 'junk', opportunities: 'not-an-array' });
    expect(s.opportunities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

describe('buildOpportunityEvaluation', () => {
  it('starts in awaiting_research with pending agent verdict', () => {
    const o = buildOpportunityEvaluation({ painPointId: 'pp1', painPointSummary: 'X' });
    expect(o.status).toBe('awaiting_research');
    expect(o.agentVerdict).toBe('pending');
    expect(o.founderVerdict).toBeNull();
    expect(o.pushbackVersion).toBe(0);
    expect(o.layerAResearch).toBeNull();
    expect(o.layerBScript).toBeNull();
    expect(o.id).toMatch(/.+/);
  });
});

describe('buildCommunityResponse', () => {
  it('text_paste sets moderationPassed=true (no vision needed)', () => {
    const r = buildCommunityResponse({ opportunityId: 'oe1', source: 'text_paste', pastedText: 'hi' });
    expect(r.source).toBe('text_paste');
    expect(r.pastedText).toBe('hi');
    expect(r.moderationPassed).toBe(true);
    expect(r.s3Url).toBeNull();
  });
  it('screenshot starts moderationPassed=false until the gate clears it', () => {
    const r = buildCommunityResponse({ opportunityId: 'oe1', source: 'screenshot', s3Url: 's3://x', s3Key: 'k' });
    expect(r.source).toBe('screenshot');
    expect(r.moderationPassed).toBe(false);
    expect(r.s3Url).toBe('s3://x');
    expect(r.pastedText).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FIFO eviction
// ---------------------------------------------------------------------------

describe('appendCommunityResponse FIFO', () => {
  it('keeps at most MAX_RESPONSES_PER_OPPORTUNITY per opp; oldest evicted first', () => {
    let s = createEmptyStage4AuthoringState();
    for (let i = 0; i < MAX_RESPONSES_PER_OPPORTUNITY + 3; i++) {
      const r = buildCommunityResponse({ opportunityId: 'oe1', source: 'text_paste', pastedText: `n${i}` });
      s = appendCommunityResponse(s, r);
    }
    const forOpp = s.founderCommunityResponses.filter(r => r.opportunityId === 'oe1');
    expect(forOpp).toHaveLength(MAX_RESPONSES_PER_OPPORTUNITY);
    expect(forOpp[0].pastedText).toBe('n3');                  // first 3 evicted
    expect(forOpp[forOpp.length - 1].pastedText).toBe(`n${MAX_RESPONSES_PER_OPPORTUNITY + 2}`);
  });
  it('does not evict from other opps', () => {
    let s = createEmptyStage4AuthoringState();
    for (let i = 0; i < MAX_RESPONSES_PER_OPPORTUNITY + 3; i++) {
      s = appendCommunityResponse(s, buildCommunityResponse({ opportunityId: 'oe1', source: 'text_paste', pastedText: `a${i}` }));
    }
    s = appendCommunityResponse(s, buildCommunityResponse({ opportunityId: 'oe2', source: 'text_paste', pastedText: 'b' }));
    expect(s.founderCommunityResponses.filter(r => r.opportunityId === 'oe2')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Verdict transitions
// ---------------------------------------------------------------------------

describe('applyAgentVerdict / applyFounderVerdict', () => {
  it('agent verdict moves status to evaluated', () => {
    const o = buildOpportunityEvaluation({ painPointId: 'pp1', painPointSummary: 'X' });
    const after = applyAgentVerdict(o, 'pursue_with_caveats', 'because X');
    expect(after.status).toBe('evaluated');
    expect(after.agentVerdict).toBe('pursue_with_caveats');
    expect(after.agentReasoning).toBe('because X');
  });
  it('founder drop flips status to rejected_by_founder', () => {
    const o = applyAgentVerdict(buildOpportunityEvaluation({ painPointId: 'pp1', painPointSummary: 'X' }), 'pursue', 'r');
    const after = applyFounderVerdict(o, 'drop');
    expect(after.founderVerdict).toBe('drop');
    expect(after.status).toBe('rejected_by_founder');
  });
});

// ---------------------------------------------------------------------------
// Recommended actions — FIFO + sticky-completed merge
// ---------------------------------------------------------------------------

describe('appendStage4RecommendedAction', () => {
  it('merges duplicates by action key (case + whitespace insensitive)', () => {
    let s = appendStage4RecommendedAction(createEmptyStage4AuthoringState(), action({ action: 'Talk to 3 people' }));
    s     = appendStage4RecommendedAction(s, action({ action: '  talk to 3 people  ', severity: 'strongly_advised' }));
    expect(s.recommendedActions).toHaveLength(1);
    expect(s.recommendedActions[0].severity).toBe('strongly_advised');
  });
  it('evicts oldest non-completed action when cap is breached', () => {
    let s = createEmptyStage4AuthoringState();
    for (let i = 0; i < MAX_RECOMMENDED_ACTIONS_STAGE4 + 3; i++) {
      s = appendStage4RecommendedAction(s, action({ action: `Action ${i}` }));
    }
    expect(s.recommendedActions).toHaveLength(MAX_RECOMMENDED_ACTIONS_STAGE4);
  });
});

// ---------------------------------------------------------------------------
// Readiness gate
// ---------------------------------------------------------------------------

describe('computeStage4Readiness', () => {
  it('false when no opportunities', () => {
    expect(computeStage4Readiness(createEmptyStage4AuthoringState())).toBe(false);
  });
  it('false when an opp is evaluated but founder dropped it', () => {
    let s = createEmptyStage4AuthoringState();
    const o = applyFounderVerdict(applyAgentVerdict(buildOpportunityEvaluation({ painPointId: 'pp1', painPointSummary: 'X' }), 'pursue', 'r'), 'drop');
    s = appendOpportunity(s, o);
    expect(computeStage4Readiness(s)).toBe(false);
  });
  it('true when one opp is evaluated AND founder did NOT drop', () => {
    let s = createEmptyStage4AuthoringState();
    const o = applyFounderVerdict(applyAgentVerdict(buildOpportunityEvaluation({ painPointId: 'pp1', painPointSummary: 'X' }), 'pursue', 'r'), 'pursue');
    s = appendOpportunity(s, o);
    expect(computeStage4Readiness(s)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aggregate signal — validationStrength ladder
// ---------------------------------------------------------------------------

describe('computeAggregateSignal', () => {
  it('null when zero responses', () => {
    expect(computeAggregateSignal([])).toBeNull();
  });
  it("'strong' when positive >= 3 and positive >= 2× negative", () => {
    const r = screenshotResponse('o', makeExtracted({ positive: 4, negative: 1 }));
    const sig = computeAggregateSignal([r]);
    expect(sig?.validationStrength).toBe('strong');
    expect(sig?.sentimentBreakdown).toEqual({ positive: 4, neutral: 0, negative: 1 });
  });
  it("'contradictory' when negative > positive AND contradictions raised", () => {
    const r = screenshotResponse('o', makeExtracted({ positive: 1, negative: 3, contras: ['no thanks', 'wrong audience'] }));
    expect(computeAggregateSignal([r])?.validationStrength).toBe('contradictory');
  });
  it("'weak' when total signal count is under 3", () => {
    const r = screenshotResponse('o', makeExtracted({ positive: 1, negative: 1 }));
    expect(computeAggregateSignal([r])?.validationStrength).toBe('weak');
  });
  it("'mixed' for the in-between case", () => {
    const r = screenshotResponse('o', makeExtracted({ positive: 2, negative: 2 }));
    expect(computeAggregateSignal([r])?.validationStrength).toBe('mixed');
  });
  it('text_paste contributes one neutral signal each (no sentiment carried)', () => {
    const t = buildCommunityResponse({ opportunityId: 'o', source: 'text_paste', pastedText: 'someone said this' });
    expect(computeAggregateSignal([t])?.sentimentBreakdown).toEqual({ positive: 0, neutral: 1, negative: 0 });
  });
});

// ---------------------------------------------------------------------------
// Chosen-#1 ranker
// ---------------------------------------------------------------------------

describe('pickChosenOpportunity', () => {
  function mkOpp(input: {
    id: string;
    agent: 'pursue' | 'pursue_with_caveats' | 'drop' | 'pending';
    founder: 'pursue' | 'pursue_with_caveats' | 'drop' | null;
    strength?: 'strong' | 'mixed' | 'weak' | 'contradictory';
  }): OpportunityEvaluation {
    const base = buildOpportunityEvaluation({ painPointId: 'pp', painPointSummary: input.id });
    return {
      ...base,
      id:             input.id,
      agentVerdict:   input.agent,
      founderVerdict: input.founder,
      status:         input.founder === 'drop' ? 'rejected_by_founder' : 'evaluated',
      layerBExtractedSignal: input.strength ? {
        validationStrength:  input.strength,
        keyQuotes:           [],
        sentimentBreakdown:  { positive: 0, neutral: 0, negative: 0 },
        contradictionsRaised: [],
      } : null,
    };
  }
  it('null when no opportunity has a non-drop founder verdict', () => {
    expect(pickChosenOpportunity([])).toBeNull();
    expect(pickChosenOpportunity([mkOpp({ id: 'a', agent: 'pursue', founder: 'drop' })])).toBeNull();
  });
  it('pursue ranks above pursue_with_caveats', () => {
    const a = mkOpp({ id: 'pwc', agent: 'pursue_with_caveats', founder: 'pursue_with_caveats', strength: 'strong' });
    const b = mkOpp({ id: 'p',   agent: 'pursue',              founder: 'pursue',              strength: 'mixed'  });
    expect(pickChosenOpportunity([a, b])?.id).toBe('p');
  });
  it('alignment between agent + founder breaks ties', () => {
    const aligned    = mkOpp({ id: 'aligned',    agent: 'pursue',              founder: 'pursue',              strength: 'weak' });
    const misaligned = mkOpp({ id: 'misaligned', agent: 'pursue_with_caveats', founder: 'pursue',              strength: 'weak' });
    expect(pickChosenOpportunity([misaligned, aligned])?.id).toBe('aligned');
  });
  it("'contradictory' validationStrength tanks rank below alignment bonus", () => {
    const contra  = mkOpp({ id: 'contra',  agent: 'pursue', founder: 'pursue', strength: 'contradictory' });
    const noSignal = mkOpp({ id: 'noSig',  agent: 'pursue', founder: 'pursue' /* no strength */ });
    expect(pickChosenOpportunity([contra, noSignal])?.id).toBe('noSig');
  });
});

// ---------------------------------------------------------------------------
// Cascade-deletion: removing an opportunity also removes its responses
// ---------------------------------------------------------------------------

describe('removeOpportunityById', () => {
  it('removes the opportunity AND its linked responses', () => {
    let s = createEmptyStage4AuthoringState();
    const o = buildOpportunityEvaluation({ painPointId: 'pp', painPointSummary: 'X' });
    s = appendOpportunity(s, o);
    s = appendCommunityResponse(s, buildCommunityResponse({ opportunityId: o.id, source: 'text_paste', pastedText: 'r' }));
    s = appendCommunityResponse(s, buildCommunityResponse({ opportunityId: 'other-opp', source: 'text_paste', pastedText: 'r2' }));

    s = removeOpportunityById(s, o.id);

    expect(s.opportunities).toHaveLength(0);
    expect(s.founderCommunityResponses).toHaveLength(1);
    expect(s.founderCommunityResponses[0].opportunityId).toBe('other-opp');
  });
});
