// src/lib/ideation/stage3-opportunities/composer.test.ts
//
// Tests the composer's deterministic shortlist selection. The
// rulesOut LLM call is mocked through withModelFallback so the test
// focuses on the math:
//
//   - Throws below MIN_PAIN_POINTS_FOR_COMMIT viable rated pain points
//   - Sorts by combinedScore DESC
//   - Slices to SHORTLIST_CAP (=5) — never advances more than that
//   - Stable sort preserves first-seen order on ties

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

import { composePainInventoryDocument } from './composer';
import {
  createEmptyStage3AuthoringState,
  buildPainPoint,
  appendPainPoint,
  applyFounderScores,
} from './state';
import { MIN_PAIN_POINTS_FOR_COMMIT, SHORTLIST_CAP } from './constants';
import type { Stage3AuthoringState } from './schema';
import type { OutcomeDocument } from '../stage1-outcome/schema';
import type { RequirementsDocument } from '../stage2-requirements/schema';

beforeEach(() => {
  mocks.withModelFallback.mockReset();
  mocks.withModelFallback.mockResolvedValue({ rulesOut: 'stub rules out paragraph' });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeOutcome(): OutcomeDocument {
  return {
    dimensions: {
      timeHorizon:         { value: '6-18mo',         confidence: 0.8, extractedAt: null },
      financialGoal:       { value: { shape: 'side_income', target: '$2k/mo' }, confidence: 0.8, extractedAt: null },
      riskTolerance:       { value: 'moderate',       confidence: 0.8, extractedAt: null },
      lifestylePreference: { value: 'side_hustle',    confidence: 0.8, extractedAt: null },
    },
    synthesisParagraph: 'Side hustle aiming for steady side income.',
    rulesOut:           'No venture-scale work.',
    recommendedActions: [],
  };
}

function fakeRequirements(): RequirementsDocument {
  return {
    skillInventorySnapshot: { founder: { tiers: {} as Record<string, 'unknown'> }, team: [] } as unknown as RequirementsDocument['skillInventorySnapshot'],
    expectedProfile: [],
    constraints: [],
    recommendedActions: [],
    structuralBlocker: { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
    researchLog: [],
    composedAt: '2026-05-12T00:00:00.000Z',
  };
}

function authoringWithRated(scoresPerPoint: Array<[number, number, number]>): Stage3AuthoringState {
  let s = createEmptyStage3AuthoringState();
  for (let i = 0; i < scoresPerPoint.length; i++) {
    const [intensity, frequency, nicheSpecificity] = scoresPerPoint[i];
    const pp = buildPainPoint({
      source: 'founder',
      description: `pain ${i}`,
      founderContext: null,
      founderNotes:   null,
    });
    const rated = applyFounderScores(pp, { intensity, frequency, nicheSpecificity });
    s = appendPainPoint(s, rated);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Floor enforcement
// ---------------------------------------------------------------------------

describe('composePainInventoryDocument — floor enforcement', () => {
  it(`throws below ${MIN_PAIN_POINTS_FOR_COMMIT} viable rated pain points`, async () => {
    const s = authoringWithRated([[5, 5, 5], [4, 4, 4]]);
    await expect(
      composePainInventoryDocument({
        state: s,
        outcomeDocument:      fakeOutcome(),
        requirementsDocument: fakeRequirements(),
      }),
    ).rejects.toThrow();
  });

  it(`composes at the floor (${MIN_PAIN_POINTS_FOR_COMMIT} viable)`, async () => {
    const s = authoringWithRated([[3, 3, 3], [3, 3, 3], [3, 3, 3]]);
    const doc = await composePainInventoryDocument({
      state: s,
      outcomeDocument:      fakeOutcome(),
      requirementsDocument: fakeRequirements(),
    });
    expect(doc.shortlist).toHaveLength(MIN_PAIN_POINTS_FOR_COMMIT);
  });
});

// ---------------------------------------------------------------------------
// Shortlist selection — sort by combinedScore DESC, slice to cap
// ---------------------------------------------------------------------------

describe('composePainInventoryDocument — shortlist selection', () => {
  it("never advances more than SHORTLIST_CAP entries", async () => {
    // 7 rated; cap is 5.
    const s = authoringWithRated([
      [5, 5, 5], [4, 4, 4], [3, 3, 3], [2, 2, 2], [1, 1, 1],
      [3, 4, 4], [2, 3, 4],
    ]);
    const doc = await composePainInventoryDocument({
      state: s,
      outcomeDocument:      fakeOutcome(),
      requirementsDocument: fakeRequirements(),
    });
    expect(doc.shortlist).toHaveLength(SHORTLIST_CAP);
  });

  it("orders shortlist by combinedScore DESC", async () => {
    // Pain points with scores: 125, 64, 27, 8, 1 → indices 0..4 mapped
    // by combinedScore = intensity * frequency * niche.
    const s = authoringWithRated([
      [1, 1, 1],   // combined = 1
      [5, 5, 5],   // combined = 125
      [3, 3, 3],   // combined = 27
      [4, 4, 4],   // combined = 64
      [2, 2, 2],   // combined = 8
    ]);
    const doc = await composePainInventoryDocument({
      state: s,
      outcomeDocument:      fakeOutcome(),
      requirementsDocument: fakeRequirements(),
    });
    // The shortlist contains ids — look them up in the snapshot to
    // get combinedScore for assertion.
    const lookup = new Map(doc.painPointsSnapshot.map(p => [p.id, p]));
    const shortlistScores = doc.shortlist.map(id => lookup.get(id)!.combinedScore);
    expect(shortlistScores).toEqual([125, 64, 27, 8, 1]);
  });

  it("snapshot contains the full inventory, not just the shortlist", async () => {
    const s = authoringWithRated([
      [5, 5, 5], [5, 5, 5], [5, 5, 5], [5, 5, 5], [5, 5, 5],
      [1, 1, 1], [1, 1, 1],
    ]);
    const doc = await composePainInventoryDocument({
      state: s,
      outcomeDocument:      fakeOutcome(),
      requirementsDocument: fakeRequirements(),
    });
    expect(doc.painPointsSnapshot).toHaveLength(7);
    expect(doc.shortlist).toHaveLength(SHORTLIST_CAP);
  });

  it("rulesOut prose comes from the LLM (mocked)", async () => {
    mocks.withModelFallback.mockResolvedValueOnce({ rulesOut: 'specific reason text' });
    const s = authoringWithRated([[3, 3, 3], [3, 3, 3], [3, 3, 3]]);
    const doc = await composePainInventoryDocument({
      state: s,
      outcomeDocument:      fakeOutcome(),
      requirementsDocument: fakeRequirements(),
    });
    expect(doc.rulesOut).toBe('specific reason text');
  });
});
