// src/lib/ideation/stage5-handoff/__tests__/render-strategic-analysis.test.ts
//
// Pure-function tests for renderStrategicAnalysis and its two
// helper functions (summariseCitations + whyNotChosenTemplate).
// No LLM, no DB. Verifies the brief's contract:
//   - non-empty output from a minimal valid input
//   - all founder-typed AND LLM-emitted reasoning gets wrapped
//   - enum values stay unwrapped
//   - citations render as "count + platforms" not full URLs (Q1)
//   - mechanical "why not chosen" templates fire correctly for each
//     combination of verdict / strength (Q2)
//   - char budgets enforced via truncation

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// Stub server-helpers so importing this file's module graph does not
// drag in next-auth → next/server at test-load time. Preserves the
// triple-bracket delimiter so canary assertions still resolve.
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown, maxLen = 600) => {
    const str = typeof s === 'string' ? s : String(s ?? '');
    const clean = str.slice(0, maxLen);
    return clean ? `[[[${clean}]]]` : '[[[EMPTY]]]';
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

import {
  renderStrategicAnalysis,
  __testInternals,
} from '../render-strategic-analysis';
import type {
  ChosenOpportunitySnapshot,
  ReserveOpportunity,
} from '../schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeChosen(overrides: Partial<ChosenOpportunitySnapshot> = {}): ChosenOpportunitySnapshot {
  return {
    id:               'opp_chosen',
    painPointSummary: 'Marketing teams struggle to attribute spend across channels.',
    agentVerdict:     'pursue',
    founderVerdict:   'pursue',
    agentReasoning:   'Multi-channel attribution surfaces in 60% of marketing-team complaints.',
    layerASummary: {
      marketReality:  { reasoning: 'Crowded but no clear leader.',       confidence: 0.7 },
      customerAccess: { reasoning: 'Marketers active on LinkedIn.',       confidence: 0.8 },
      willPeoplePay:  { reasoning: 'Existing budget in attribution tools.', confidence: 0.75 },
      marketSize:     { reasoning: 'Estimated $2B SAM.',                  confidence: 0.6 },
    },
    layerBSummary: {
      validationStrength: 'strong',
      sentimentBreakdown: { positive: 7, neutral: 2, negative: 1 },
      keyQuotes:          ['Yes, this is killing us every quarter.'],
      contradictionsRaised: [],
    },
    ...overrides,
  };
}

function fakeReserve(overrides: Partial<ReserveOpportunity> = {}): ReserveOpportunity {
  return {
    id:               'r1',
    painPointSummary: 'Backup orchestration for SMB IT teams.',
    agentVerdict:     'pursue',
    founderVerdict:   'pursue',
    agentReasoning:   'Real pain but crowded.',
    layerASummary:    null,
    layerBSummary:    null,
    rank:             1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('renderStrategicAnalysis — invariants', () => {
  it('returns a non-empty string from a minimal valid input', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen(),
      chosenRow: null,
      reserves:  [],
    });
    expect(out.length).toBeGreaterThan(200);
  });

  it('emits all four named section headers', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen(),
      chosenRow: null,
      reserves:  [fakeReserve()],
    });
    expect(out).toContain('OPPORTUNITY UNDER EVALUATION');
    expect(out).toContain('LAYER A — 4-DIMENSION RESEARCH');
    expect(out).toContain('LAYER B — COMMUNITY ENGAGEMENT');
    expect(out).toContain('ALTERNATIVES CONSIDERED');
  });

  it('renders a fallback when Layer A is absent', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen({ layerASummary: null }),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toContain('Layer A research was not completed');
  });

  it('renders a fallback when Layer B is absent', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen({ layerBSummary: null }),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toContain('No community responses were captured');
  });

  it('renders a fallback when there are no reserves', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen(),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toContain('No alternative opportunities were evaluated');
  });
});

// ---------------------------------------------------------------------------
// Security — wrapping
// ---------------------------------------------------------------------------

describe('renderStrategicAnalysis — security wrapping', () => {
  it('wraps the chosen pain summary', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen({ painPointSummary: 'CANARY_CHOSEN_PAIN' }),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toMatch(/\[\[\[CANARY_CHOSEN_PAIN\]\]\]/);
  });

  it('wraps the chosen agent reasoning', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen({ agentReasoning: 'CANARY_AGENT_REASONING' }),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toMatch(/\[\[\[CANARY_AGENT_REASONING\]\]\]/);
  });

  it('wraps Layer A per-dimension reasoning', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen({
        layerASummary: {
          marketReality:  { reasoning: 'CANARY_MARKET_REALITY', confidence: 0.7 },
          customerAccess: { reasoning: 'ca', confidence: 0.5 },
          willPeoplePay:  { reasoning: 'pay', confidence: 0.5 },
          marketSize:     { reasoning: 'sz', confidence: 0.5 },
        },
      }),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toMatch(/\[\[\[CANARY_MARKET_REALITY\]\]\]/);
  });

  it('wraps Layer B key quotes', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen({
        layerBSummary: {
          validationStrength: 'mixed',
          sentimentBreakdown: { positive: 1, neutral: 1, negative: 1 },
          keyQuotes:          ['CANARY_QUOTE'],
          contradictionsRaised: [],
        },
      }),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toMatch(/\[\[\[CANARY_QUOTE\]\]\]/);
  });

  it('wraps reserve pain summaries', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen(),
      chosenRow: null,
      reserves:  [fakeReserve({ painPointSummary: 'CANARY_RESERVE' })],
    });
    expect(out).toMatch(/\[\[\[CANARY_RESERVE\]\]\]/);
  });
});

// ---------------------------------------------------------------------------
// Security — enum values stay unwrapped
// ---------------------------------------------------------------------------

describe('renderStrategicAnalysis — enum values unwrapped', () => {
  it('does NOT wrap verdict values', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen(),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toContain('Agent verdict: pursue');
    expect(out).not.toContain('[[[pursue]]]');
  });

  it('does NOT wrap validation strength enum', () => {
    const out = renderStrategicAnalysis({
      chosen:    fakeChosen(),
      chosenRow: null,
      reserves:  [],
    });
    expect(out).toContain('Validation strength: strong');
    expect(out).not.toContain('[[[strong]]]');
  });
});

// ---------------------------------------------------------------------------
// Q1 — Citations: count + distinct platforms (NOT full URLs)
// ---------------------------------------------------------------------------

describe('summariseCitations (Q1 approved shape)', () => {
  const { summariseCitations } = __testInternals;

  it('returns "no citations" on empty input', () => {
    expect(summariseCitations([])).toBe('no citations');
  });

  it('renders count + distinct platforms', () => {
    const out = summariseCitations([
      { url: 'https://news.ycombinator.com/item?id=1', excerpt: 'x', sourcePlatform: 'HN' },
      { url: 'https://news.ycombinator.com/item?id=2', excerpt: 'x', sourcePlatform: 'HN' },
      { url: 'https://github.com/repo/issues/3',       excerpt: 'x', sourcePlatform: 'GitHub Issues' },
    ]);
    expect(out).toBe('3 citations across GitHub Issues, HN');
  });

  it('singularises one citation', () => {
    const out = summariseCitations([
      { url: 'https://a', excerpt: 'x', sourcePlatform: 'Lemmy' },
    ]);
    expect(out).toBe('1 citation across Lemmy');
  });

  it('falls back when platform metadata is missing', () => {
    const out = summariseCitations([
      { url: 'https://a', excerpt: 'x', sourcePlatform: '' },
    ]);
    expect(out).toBe('1 citation (no platform metadata)');
  });

  it('does not include any URL in the output (the Q1 contract)', () => {
    const out = summariseCitations([
      { url: 'https://leakcanary.example.com/path?with=secrets', excerpt: 'x', sourcePlatform: 'Reddit' },
    ]);
    expect(out).not.toContain('leakcanary');
    expect(out).not.toContain('https');
  });
});

// ---------------------------------------------------------------------------
// Q2 — Mechanical "why not chosen" templates
// ---------------------------------------------------------------------------

describe('whyNotChosenTemplate (Q2 approved mechanical templates)', () => {
  const { whyNotChosenTemplate } = __testInternals;

  it('founder dropped → explicit-drop framing', () => {
    expect(whyNotChosenTemplate(fakeReserve({ founderVerdict: 'drop' })))
      .toBe('founder explicitly dropped this option');
  });

  it('agent pursue_with_caveats + Layer B contradictory → combined caveats + contradictory', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue_with_caveats',
      founderVerdict: 'pursue',
      layerBSummary:  { validationStrength: 'contradictory', sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }, keyQuotes: [], contradictionsRaised: [] },
    }))).toBe('agent flagged caveats and community engagement was contradictory');
  });

  it('agent pursue_with_caveats + Layer B weak → combined caveats + weak', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue_with_caveats',
      founderVerdict: 'pursue',
      layerBSummary:  { validationStrength: 'weak', sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }, keyQuotes: [], contradictionsRaised: [] },
    }))).toBe('agent flagged caveats and community engagement was weak');
  });

  it('agent pursue_with_caveats alone → caveats framing', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue_with_caveats',
      founderVerdict: 'pursue',
      layerBSummary:  null,
    }))).toBe('agent flagged caveats around this opportunity');
  });

  it('agent drop → explicit-drop framing', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'drop',
      founderVerdict: 'pursue',
    }))).toBe('agent recommended dropping this opportunity');
  });

  it('agent pursue + Layer B contradictory → divergence framing', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue',
      founderVerdict: 'pursue',
      layerBSummary:  { validationStrength: 'contradictory', sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }, keyQuotes: [], contradictionsRaised: [] },
    }))).toBe('agent recommended pursue but community engagement was contradictory');
  });

  it('agent pursue + Layer B weak → divergence framing', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue',
      founderVerdict: 'pursue',
      layerBSummary:  { validationStrength: 'weak', sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }, keyQuotes: [], contradictionsRaised: [] },
    }))).toBe('agent recommended pursue but community engagement was weak');
  });

  it('founder did not commit → neutral framing', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue',
      founderVerdict: null,
      layerBSummary:  null,
    }))).toBe('founder did not commit a verdict before advancing the chosen opportunity');
  });

  it('founder pursue_with_caveats → softer ranking framing', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue',
      founderVerdict: 'pursue_with_caveats',
      layerBSummary:  null,
    }))).toBe('founder marked pursue-with-caveats; chosen opportunity ranked higher');
  });

  it('both pursue + neutral Layer B → fallback positive-but-outranked', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue',
      founderVerdict: 'pursue',
      layerBSummary:  { validationStrength: 'mixed', sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }, keyQuotes: [], contradictionsRaised: [] },
    }))).toBe('positive signal but ranked below the chosen opportunity');
  });

  it('both pursue + Layer B strong → fallback positive-but-outranked', () => {
    expect(whyNotChosenTemplate(fakeReserve({
      agentVerdict:   'pursue',
      founderVerdict: 'pursue',
      layerBSummary:  { validationStrength: 'strong', sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }, keyQuotes: [], contradictionsRaised: [] },
    }))).toBe('positive signal but ranked below the chosen opportunity');
  });
});

// ---------------------------------------------------------------------------
// Truncation — alternative section budget under pathological input
// ---------------------------------------------------------------------------

describe('renderStrategicAnalysis — char budget truncation', () => {
  it('truncates a pathologically long agent reasoning string', () => {
    const huge = 'X'.repeat(10_000);
    const out  = renderStrategicAnalysis({
      chosen:    fakeChosen({ agentReasoning: huge }),
      chosenRow: null,
      reserves:  [],
    });
    // Sum of all section budgets is around 5000 + headers; 10k canary
    // would otherwise dominate. Slice keeps it bounded.
    expect(out.length).toBeLessThan(7000);
  });
});
