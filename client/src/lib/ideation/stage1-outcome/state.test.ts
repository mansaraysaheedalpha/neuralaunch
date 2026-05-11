// src/lib/ideation/stage1-outcome/state.test.ts
//
// Tests target the Stage 1 state machine's invariants — confidence
// merging policy, drift-counter reset semantics, recommended-action
// dedup + FIFO eviction, the composition gate, and the safeParse
// boundary. All pure functions, no mocks needed.

import { describe, it, expect } from 'vitest';
import {
  createEmptyStage1AuthoringState,
  applyExtractions,
  appendRecommendedAction,
  computeOutcomeReadiness,
  safeParseStage1AuthoringState,
  safeParseOutcomeDocument,
  type Stage1Extraction,
} from './state';
import type { RecommendedAction } from './schema';
import { MIN_OUTCOME_FIELD_CONFIDENCE, MAX_RECOMMENDED_ACTIONS } from '../constants';

// ---------------------------------------------------------------------------
// applyExtractions
// ---------------------------------------------------------------------------

describe('applyExtractions — confidence merge policy', () => {
  it('writes a dimension when prior confidence is zero, regardless of new confidence', () => {
    const state = createEmptyStage1AuthoringState();
    const next = applyExtractions(state, [
      { field: 'timeHorizon', value: '6-18mo', confidence: 0.3 },
    ]);
    expect(next.dimensions.timeHorizon.value).toBe('6-18mo');
    expect(next.dimensions.timeHorizon.confidence).toBe(0.3);
  });

  it('overwrites with strictly higher confidence', () => {
    const state = applyExtractions(createEmptyStage1AuthoringState(), [
      { field: 'timeHorizon', value: '6-18mo', confidence: 0.5 },
    ]);
    const next = applyExtractions(state, [
      { field: 'timeHorizon', value: '<6mo', confidence: 0.9 },
    ]);
    expect(next.dimensions.timeHorizon.value).toBe('<6mo');
    expect(next.dimensions.timeHorizon.confidence).toBe(0.9);
  });

  it('REJECTS lower-confidence overwrites — earlier explicit answer wins', () => {
    const state = applyExtractions(createEmptyStage1AuthoringState(), [
      { field: 'timeHorizon', value: '<6mo', confidence: 0.9 },
    ]);
    const next = applyExtractions(state, [
      { field: 'timeHorizon', value: 'open', confidence: 0.4 },
    ]);
    expect(next.dimensions.timeHorizon.value).toBe('<6mo');
    expect(next.dimensions.timeHorizon.confidence).toBe(0.9);
  });

  it('clamps confidence to [0, 1]', () => {
    const state = applyExtractions(createEmptyStage1AuthoringState(), [
      { field: 'timeHorizon', value: '6-18mo', confidence: 1.5 },
    ]);
    expect(state.dimensions.timeHorizon.confidence).toBe(1);
  });

  it('accepts a financialGoal extraction with the compound shape', () => {
    const state = applyExtractions(createEmptyStage1AuthoringState(), [
      {
        field:      'financialGoal',
        value:      { shape: 'full_replacement', target: '£4k/month' },
        confidence: 0.85,
      },
    ]);
    expect(state.dimensions.financialGoal.value).toEqual({
      shape:  'full_replacement',
      target: '£4k/month',
    });
  });
});

describe('applyExtractions — drift counter', () => {
  it('increments questionsSinceLastConfidenceGain when nothing crosses the threshold', () => {
    const state = createEmptyStage1AuthoringState();
    const next  = applyExtractions(state, []);
    expect(next.questionsSinceLastConfidenceGain).toBe(1);
  });

  it('increments when extractions arrive but no dim crosses MIN_OUTCOME_FIELD_CONFIDENCE', () => {
    const state = applyExtractions(createEmptyStage1AuthoringState(), [
      { field: 'timeHorizon', value: '6-18mo', confidence: 0.4 },
    ]);
    expect(state.questionsSinceLastConfidenceGain).toBe(1);
    const next = applyExtractions(state, [
      { field: 'riskTolerance', value: 'moderate', confidence: 0.4 },
    ]);
    expect(next.questionsSinceLastConfidenceGain).toBe(2);
  });

  it('resets to 0 when a dim crosses MIN_OUTCOME_FIELD_CONFIDENCE for the first time', () => {
    const state = { ...createEmptyStage1AuthoringState(), questionsSinceLastConfidenceGain: 3 };
    const next = applyExtractions(state, [
      { field: 'timeHorizon', value: '6-18mo', confidence: MIN_OUTCOME_FIELD_CONFIDENCE },
    ]);
    expect(next.questionsSinceLastConfidenceGain).toBe(0);
  });

  it('does NOT reset when an already-known dim gets an even higher confidence', () => {
    let s = applyExtractions(createEmptyStage1AuthoringState(), [
      { field: 'timeHorizon', value: '6-18mo', confidence: 0.7 },
    ]);
    // The first cross resets to 0.
    expect(s.questionsSinceLastConfidenceGain).toBe(0);
    // Second extraction reinforces the same dim above threshold — no
    // new ground gained, counter increments.
    s = applyExtractions(s, [
      { field: 'timeHorizon', value: '6-18mo', confidence: 0.95 },
    ]);
    expect(s.questionsSinceLastConfidenceGain).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// appendRecommendedAction
// ---------------------------------------------------------------------------

function action(over: Partial<RecommendedAction> = {}): RecommendedAction {
  return {
    action:          'talk to three people',
    severity:        'suggested',
    raisedAt:        new Date('2026-05-01').toISOString(),
    status:          'pending',
    founderResponse: null,
    ...over,
  };
}

describe('appendRecommendedAction', () => {
  it('appends a new action', () => {
    const state = appendRecommendedAction(createEmptyStage1AuthoringState(), action());
    expect(state.recommendedActions).toHaveLength(1);
  });

  it('dedups by case-insensitive trimmed action text', () => {
    let s = appendRecommendedAction(createEmptyStage1AuthoringState(), action({ action: 'Talk To Three People' }));
    s = appendRecommendedAction(s, action({ action: 'talk to three people  ' }));
    expect(s.recommendedActions).toHaveLength(1);
  });

  it('escalates severity from suggested to strongly_advised on dedup', () => {
    let s = appendRecommendedAction(createEmptyStage1AuthoringState(), action({ severity: 'suggested' }));
    s = appendRecommendedAction(s, action({ severity: 'strongly_advised' }));
    expect(s.recommendedActions[0].severity).toBe('strongly_advised');
  });

  it('keeps strongly_advised when a subsequent dedup arrives as suggested', () => {
    let s = appendRecommendedAction(createEmptyStage1AuthoringState(), action({ severity: 'strongly_advised' }));
    s = appendRecommendedAction(s, action({ severity: 'suggested' }));
    expect(s.recommendedActions[0].severity).toBe('strongly_advised');
  });

  it('FIFO evicts the oldest non-completed entry once the cap is hit', () => {
    let s = createEmptyStage1AuthoringState();
    // Fill to the cap with non-completed pending entries.
    for (let i = 0; i < MAX_RECOMMENDED_ACTIONS; i++) {
      s = appendRecommendedAction(s, action({ action: `action ${i}` }));
    }
    expect(s.recommendedActions).toHaveLength(MAX_RECOMMENDED_ACTIONS);
    s = appendRecommendedAction(s, action({ action: 'newest' }));
    expect(s.recommendedActions).toHaveLength(MAX_RECOMMENDED_ACTIONS);
    // Oldest dropped, newest at the tail.
    expect(s.recommendedActions[0].action).toBe('action 1');
    expect(s.recommendedActions[s.recommendedActions.length - 1].action).toBe('newest');
  });

  it('keeps completed entries sticky during eviction', () => {
    let s = createEmptyStage1AuthoringState();
    // First entry is completed — should NOT be evicted.
    s = appendRecommendedAction(s, action({ action: 'completed-action', status: 'completed' }));
    for (let i = 0; i < MAX_RECOMMENDED_ACTIONS - 1; i++) {
      s = appendRecommendedAction(s, action({ action: `action ${i}` }));
    }
    expect(s.recommendedActions).toHaveLength(MAX_RECOMMENDED_ACTIONS);
    s = appendRecommendedAction(s, action({ action: 'newest' }));
    expect(s.recommendedActions[0].action).toBe('completed-action');
    expect(s.recommendedActions.some(a => a.action === 'newest')).toBe(true);
  });

  it('clamps the action text to 200 chars', () => {
    const long = 'x'.repeat(500);
    const s = appendRecommendedAction(createEmptyStage1AuthoringState(), action({ action: long }));
    expect(s.recommendedActions[0].action.length).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// computeOutcomeReadiness — the composition gate
// ---------------------------------------------------------------------------

describe('computeOutcomeReadiness', () => {
  function setAll(confidences: [number, number, number, number]) {
    let s = createEmptyStage1AuthoringState();
    const extractions: Stage1Extraction[] = [
      { field: 'timeHorizon',         value: '6-18mo',        confidence: confidences[0] },
      { field: 'financialGoal',       value: { shape: 'full_replacement', target: 'X' }, confidence: confidences[1] },
      { field: 'riskTolerance',       value: 'moderate',      confidence: confidences[2] },
      { field: 'lifestylePreference', value: 'side_hustle',   confidence: confidences[3] },
    ];
    s = applyExtractions(s, extractions);
    return s;
  }

  it('returns false when any dimension is below the floor', () => {
    const s = setAll([0.9, 0.9, 0.5, 0.9]);
    expect(computeOutcomeReadiness(s)).toBe(false);
  });

  it('returns false when all dims clear the floor but the mean is below the ratio', () => {
    // floor = 0.65, ratio = 0.75. Mean of all-0.65 is 0.65, fails.
    const s = setAll([0.65, 0.65, 0.65, 0.65]);
    expect(computeOutcomeReadiness(s)).toBe(false);
  });

  it('returns true when all dims clear the floor AND the mean clears the ratio', () => {
    const s = setAll([0.75, 0.85, 0.7, 0.8]);
    // mean = (0.75 + 0.85 + 0.7 + 0.8) / 4 = 0.775 ≥ 0.75
    expect(computeOutcomeReadiness(s)).toBe(true);
  });

  it('returns false on a completely empty state', () => {
    expect(computeOutcomeReadiness(createEmptyStage1AuthoringState())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// safeParse — corrupt JSON should degrade gracefully
// ---------------------------------------------------------------------------

describe('safeParseStage1AuthoringState', () => {
  it('returns an empty state for null / undefined', () => {
    expect(safeParseStage1AuthoringState(null).dimensions.timeHorizon.value).toBe(null);
    expect(safeParseStage1AuthoringState(undefined).recommendedActions).toEqual([]);
  });

  it('returns an empty state for malformed input', () => {
    const result = safeParseStage1AuthoringState({ this: 'is wrong' });
    expect(result.dimensions.financialGoal.value).toBe(null);
    expect(result.recommendedActions).toEqual([]);
    expect(result.questionsSinceLastConfidenceGain).toBe(0);
  });

  it('round-trips a valid authoring state', () => {
    const original = appendRecommendedAction(
      applyExtractions(createEmptyStage1AuthoringState(), [
        { field: 'timeHorizon', value: '6-18mo', confidence: 0.8 },
      ]),
      action(),
    );
    const round = safeParseStage1AuthoringState(JSON.parse(JSON.stringify(original)));
    expect(round.dimensions.timeHorizon.value).toBe('6-18mo');
    expect(round.recommendedActions).toHaveLength(1);
  });
});

describe('safeParseOutcomeDocument', () => {
  it('returns null on malformed input — caller decides recovery', () => {
    expect(safeParseOutcomeDocument({ wrong: 'shape' })).toBe(null);
    expect(safeParseOutcomeDocument(null)).toBe(null);
  });
});
