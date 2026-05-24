// src/lib/continuation/__tests__/reserve-integration.test.ts
//
// Covers the Stage-5-reserves → continuation-brief integration added in
// commit #4 of the Stage 5 batch:
//   - renderReserveOpportunitiesBlock pure-function behaviour
//   - empty-state fallback (legacy Discovery-flow rows)
//   - ContinuationForkSchema accepts the new optional sourceReserveId
//     in all three shapes (present-string, present-null, absent)
//
// The brief-generator itself is not unit-tested here — it's an Opus
// call. The Inngest function is wired by reference (TS check covers
// the function call site).

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// Stub server-helpers — same reason as the Stage 5 renderer tests: the
// renderer transitively imports next-auth via server-helpers and that
// has an ESM-resolution defect under the vitest loader.
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown, maxLen = 600) => {
    const str = typeof s === 'string' ? s : String(s ?? '');
    const clean = str.slice(0, maxLen);
    return clean ? `[[[${clean}]]]` : '[[[EMPTY]]]';
  },
  sanitizeForPrompt: (s: unknown, maxLen = 600) => {
    const str = typeof s === 'string' ? s : String(s ?? '');
    return str.slice(0, maxLen);
  },
}));

import { renderReserveOpportunitiesBlock } from '../brief-renderers';
import { ContinuationForkSchema } from '../brief-schema';
import type { ReserveOpportunity } from '@/lib/ideation/stage5-handoff/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeReserve(overrides: Partial<ReserveOpportunity> = {}): ReserveOpportunity {
  return {
    id:               'r1',
    painPointSummary: 'Sales reps lose track of follow-up tasks across CRMs',
    agentVerdict:     'pursue',
    founderVerdict:   'pursue',
    agentReasoning:   'Recurring complaint in HN sales-tooling threads.',
    layerASummary:    null,
    layerBSummary:    null,
    rank:             1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Renderer — happy path
// ---------------------------------------------------------------------------

describe('renderReserveOpportunitiesBlock', () => {
  it('returns an empty string when the reserves array is empty', () => {
    expect(renderReserveOpportunitiesBlock([])).toBe('');
  });

  it('emits the named block header when one reserve is present', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve()]);
    expect(block).toContain('RESERVE OPPORTUNITIES');
    expect(block).toContain('Rank 1:');
  });

  it('wraps the pain-point summary via renderUserContent (security canary)', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve({ painPointSummary: 'CANARY_PAIN' })]);
    expect(block).toMatch(/\[\[\[CANARY_PAIN\]\]\]/);
  });

  it('wraps the agent reasoning via renderUserContent', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve({ agentReasoning: 'CANARY_REASONING' })]);
    expect(block).toMatch(/\[\[\[CANARY_REASONING\]\]\]/);
  });

  it('does NOT wrap enum verdict values in the delimiter', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve({ agentVerdict: 'pursue_with_caveats', founderVerdict: 'drop' })]);
    expect(block).toContain('Stage 5 agent verdict: pursue_with_caveats');
    expect(block).toContain('Stage 5 founder verdict: drop');
    expect(block).not.toContain('[[[pursue_with_caveats]]]');
    expect(block).not.toContain('[[[drop]]]');
  });

  it('renders "did not commit" for null founderVerdict', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve({ founderVerdict: null })]);
    expect(block).toContain('Stage 5 founder verdict: did not commit');
  });

  it('surfaces the reserve id with the fork.sourceReserveId hint', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve({ id: 'r-CANARY' })]);
    expect(block).toContain('Reserve id (use as fork.sourceReserveId when pivoting to this reserve): r-CANARY');
  });

  it('renders Layer A confidence when present', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve({
      layerASummary: {
        marketReality:  { reasoning: 'mr', confidence: 0.62 },
        customerAccess: { reasoning: 'ca', confidence: 0.71 },
        willPeoplePay:  { reasoning: 'wp', confidence: 0.55 },
        marketSize:     { reasoning: 'ms', confidence: 0.83 },
      },
    })]);
    expect(block).toContain('Layer A confidence: market reality 0.62 / customer access 0.71 / will pay 0.55 / market size 0.83');
  });

  it('renders Layer B aggregate when present', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve({
      layerBSummary: {
        validationStrength: 'mixed',
        sentimentBreakdown: { positive: 3, neutral: 1, negative: 2 },
        keyQuotes:          [],
        contradictionsRaised: [],
      },
    })]);
    expect(block).toContain('Layer B aggregate: community engagement mixed (3 positive / 1 neutral / 2 negative)');
  });

  it('omits the Layer A / Layer B lines when the reserve has no signals', () => {
    const block = renderReserveOpportunitiesBlock([fakeReserve()]);
    expect(block).not.toContain('Layer A confidence');
    expect(block).not.toContain('Layer B aggregate');
  });

  it('renders multiple reserves in order with their ranks intact', () => {
    const block = renderReserveOpportunitiesBlock([
      fakeReserve({ id: 'r1', rank: 1, painPointSummary: 'PAIN_ONE' }),
      fakeReserve({ id: 'r2', rank: 2, painPointSummary: 'PAIN_TWO' }),
      fakeReserve({ id: 'r3', rank: 3, painPointSummary: 'PAIN_THREE' }),
      fakeReserve({ id: 'r4', rank: 4, painPointSummary: 'PAIN_FOUR' }),
    ]);
    expect(block).toContain('[[[PAIN_ONE]]]');
    expect(block).toContain('[[[PAIN_TWO]]]');
    expect(block).toContain('[[[PAIN_THREE]]]');
    expect(block).toContain('[[[PAIN_FOUR]]]');
    expect(block.indexOf('PAIN_ONE')).toBeLessThan(block.indexOf('PAIN_TWO'));
    expect(block.indexOf('PAIN_TWO')).toBeLessThan(block.indexOf('PAIN_THREE'));
    expect(block.indexOf('PAIN_THREE')).toBeLessThan(block.indexOf('PAIN_FOUR'));
  });
});

// ---------------------------------------------------------------------------
// Fork schema — sourceReserveId optional field
// ---------------------------------------------------------------------------

describe('ContinuationForkSchema — sourceReserveId', () => {
  const baseFork = {
    id:               'fork-1',
    title:            'Pivot to sales-rep workflows',
    rationale:        'r',
    firstStep:        'fs',
    timeEstimate:     'te',
    rightIfCondition: 'ric',
  };

  it('accepts a fork without sourceReserveId (legacy / continuation fork)', () => {
    const parsed = ContinuationForkSchema.safeParse(baseFork);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Field is optional — when absent, parsed value should be undefined.
      expect(parsed.data.sourceReserveId).toBeUndefined();
    }
  });

  it('accepts a fork with sourceReserveId set to a string (reserve-derived fork)', () => {
    const parsed = ContinuationForkSchema.safeParse({ ...baseFork, sourceReserveId: 'opp-7' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sourceReserveId).toBe('opp-7');
  });

  it('accepts a fork with sourceReserveId explicitly null', () => {
    const parsed = ContinuationForkSchema.safeParse({ ...baseFork, sourceReserveId: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sourceReserveId).toBeNull();
  });

  it('rejects a fork with sourceReserveId set to a non-string non-null value', () => {
    const parsed = ContinuationForkSchema.safeParse({ ...baseFork, sourceReserveId: 42 });
    expect(parsed.success).toBe(false);
  });
});
