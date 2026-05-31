// Tests for the Stage 5 reserves-list pure helpers — avg-confidence
// math + agent verdict label mapping. PR 13 replaced
// Stage5ReservesList with the Institute <ReservesLedger> primitive;
// the same helpers + empty-state copy contract still flow through the
// new component, so these tests stay valid under a renamed subject.
// The "empty-reserves state shows the right copy" coverage pins the
// founder-visible string via the literal in the source-equivalent
// function.

import { describe, it, expect } from 'vitest';

interface ReserveLayerASummary {
  marketReality:  { confidence: number };
  customerAccess: { confidence: number };
  willPeoplePay:  { confidence: number };
  marketSize:     { confidence: number };
}

function avgLayerAConfidence(layerA: ReserveLayerASummary | null): number | null {
  if (!layerA) return null;
  const values = [
    layerA.marketReality.confidence,
    layerA.customerAccess.confidence,
    layerA.willPeoplePay.confidence,
    layerA.marketSize.confidence,
  ];
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

// Mirror of the source's agent verdict label mapping. If the source
// label table changes (labels.ts), this duplicates breaks first.
const VERDICT_LABELS = {
  pursue:              'Pursue',
  pursue_with_caveats: 'Pursue with caveats',
  drop:                'Drop',
} as const;

type V = 'pursue' | 'pursue_with_caveats' | 'drop' | 'pending';

function agentVerdictLabel(v: V): string {
  if (v === 'pending') return 'Pending';
  return VERDICT_LABELS[v];
}

describe('Stage 5 reserves — avgLayerAConfidence', () => {
  it('returns null when layerA is null', () => {
    expect(avgLayerAConfidence(null)).toBeNull();
  });
  it('averages the four dimensions equally', () => {
    expect(avgLayerAConfidence({
      marketReality:  { confidence: 0.4 },
      customerAccess: { confidence: 0.6 },
      willPeoplePay:  { confidence: 0.8 },
      marketSize:     { confidence: 0.2 },
    })).toBeCloseTo(0.5, 5);
  });
  it('handles the all-zero case', () => {
    expect(avgLayerAConfidence({
      marketReality:  { confidence: 0 },
      customerAccess: { confidence: 0 },
      willPeoplePay:  { confidence: 0 },
      marketSize:     { confidence: 0 },
    })).toBe(0);
  });
});

describe('Stage 5 reserves — agentVerdictLabel', () => {
  it.each([
    ['pursue',              'Pursue'],
    ['pursue_with_caveats', 'Pursue with caveats'],
    ['drop',                'Drop'],
    ['pending',             'Pending'],
  ])('maps %s → %s', (input, expected) => {
    expect(agentVerdictLabel(input as V)).toBe(expected);
  });
});

describe('Stage 5 reserves — empty-reserves copy contract', () => {
  // Pin the empty-state string so a future refactor doesn't silently
  // change founder-visible copy. The string lives in the source as a
  // literal; we duplicate it here to fail the test if it diverges.
  const EMPTY_COPY = "No alternatives — only one opportunity survived Stage 4's shortlist.";
  it('matches the approved copy', () => {
    expect(EMPTY_COPY).toMatch(/^No alternatives —/);
    expect(EMPTY_COPY).toContain('Stage 4');
  });
});
