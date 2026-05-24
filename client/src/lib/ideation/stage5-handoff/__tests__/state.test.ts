// src/lib/ideation/stage5-handoff/__tests__/state.test.ts
//
// State-machine + readiness-gate invariants. Pure functions; no LLM
// or DB. Pins the brief's contract: "readiness gating (synthesis
// complete = ready to commit)."

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createEmptyStage5AuthoringState,
  safeParseStage5AuthoringState,
  seedStage5Authoring,
  applySynthesisResult,
  applySynthesisFailure,
  appendStage5RecommendedAction,
  computeStage5Readiness,
} from '../state';
import { MAX_RECOMMENDED_ACTIONS_STAGE5 } from '../constants';
import type {
  ChosenOpportunitySnapshot,
  ReserveOpportunity,
} from '../schema';
import type { RecommendedAction } from '../../stage1-outcome/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeChosen(): ChosenOpportunitySnapshot {
  return {
    id:               'opp_1',
    painPointSummary: 'founder pain',
    agentVerdict:     'pursue',
    founderVerdict:   'pursue',
    agentReasoning:   'agent reasoning',
    layerASummary:    null,
    layerBSummary:    null,
  };
}

function fakeReserve(id: string, rank: number): ReserveOpportunity {
  return {
    id,
    painPointSummary: `reserve ${id}`,
    agentVerdict:     'pursue',
    founderVerdict:   'pursue_with_caveats',
    agentReasoning:   'r',
    layerASummary:    null,
    layerBSummary:    null,
    rank,
  };
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

describe('createEmptyStage5AuthoringState', () => {
  it('starts with synthesisStatus=awaiting_synthesis and no chosen', () => {
    const s = createEmptyStage5AuthoringState();
    expect(s.synthesisStatus).toBe('awaiting_synthesis');
    expect(s.chosenOpportunity).toBeNull();
    expect(s.synthesizedRecommendationId).toBeNull();
    expect(s.reserveOpportunities).toEqual([]);
    expect(s.cascadeSnapshot).toBeNull();
    expect(s.requiresRederivation).toBe(false);
  });
});

describe('safeParseStage5AuthoringState', () => {
  it('null input yields the empty state', () => {
    expect(safeParseStage5AuthoringState(null).synthesisStatus).toBe('awaiting_synthesis');
  });
  it('garbage input degrades cleanly to the empty state', () => {
    expect(safeParseStage5AuthoringState({ random: 'junk' }).synthesisStatus).toBe('awaiting_synthesis');
  });
});

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

describe('seedStage5Authoring', () => {
  it('writes the chosen + reserves; status stays awaiting_synthesis', () => {
    const seeded = seedStage5Authoring(
      createEmptyStage5AuthoringState(),
      fakeChosen(),
      [fakeReserve('r1', 1), fakeReserve('r2', 2)],
    );
    expect(seeded.chosenOpportunity?.id).toBe('opp_1');
    expect(seeded.reserveOpportunities).toHaveLength(2);
    expect(seeded.synthesisStatus).toBe('awaiting_synthesis');
  });
});

// ---------------------------------------------------------------------------
// Synthesis result application
// ---------------------------------------------------------------------------

describe('applySynthesisResult / applySynthesisFailure', () => {
  it('success: flips status to synthesized + records the recommendation id', () => {
    const seeded = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), []);
    const after = applySynthesisResult(seeded, 'rec_abc');
    expect(after.synthesisStatus).toBe('synthesized');
    expect(after.synthesizedRecommendationId).toBe('rec_abc');
    expect(after.synthesisError).toBeNull();
  });

  it('failure: flips status to synthesis_failed + records the reason', () => {
    const seeded = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), []);
    const after = applySynthesisFailure(seeded, 'fallback chain exhausted');
    expect(after.synthesisStatus).toBe('synthesis_failed');
    expect(after.synthesisError).toBe('fallback chain exhausted');
    expect(after.synthesizedRecommendationId).toBeNull();
  });

  it('a prior synthesized result is cleared on a subsequent failure', () => {
    let s = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), []);
    s = applySynthesisResult(s, 'rec_first');
    s = applySynthesisFailure(s, 're-fire failed');
    expect(s.synthesizedRecommendationId).toBeNull();
    expect(s.synthesisStatus).toBe('synthesis_failed');
  });
});

// ---------------------------------------------------------------------------
// Recommended actions — FIFO + sticky-completed merge
// ---------------------------------------------------------------------------

describe('appendStage5RecommendedAction', () => {
  it('merges duplicates by action key (case + whitespace insensitive)', () => {
    let s = appendStage5RecommendedAction(createEmptyStage5AuthoringState(), action({ action: 'Talk to 3 people' }));
    s     = appendStage5RecommendedAction(s, action({ action: '  talk to 3 people  ', severity: 'strongly_advised' }));
    expect(s.recommendedActions).toHaveLength(1);
    expect(s.recommendedActions[0].severity).toBe('strongly_advised');
  });
  it('evicts when the cap is breached', () => {
    let s = createEmptyStage5AuthoringState();
    for (let i = 0; i < MAX_RECOMMENDED_ACTIONS_STAGE5 + 3; i++) {
      s = appendStage5RecommendedAction(s, action({ action: `Action ${i}` }));
    }
    expect(s.recommendedActions).toHaveLength(MAX_RECOMMENDED_ACTIONS_STAGE5);
  });
});

// ---------------------------------------------------------------------------
// Readiness gate
// ---------------------------------------------------------------------------

describe('computeStage5Readiness', () => {
  it('false when synthesisStatus is awaiting_synthesis', () => {
    expect(computeStage5Readiness(createEmptyStage5AuthoringState())).toBe(false);
  });

  it('false when synthesisStatus is synthesized but no chosen opportunity (shouldn\'t happen, but defensive)', () => {
    const s = applySynthesisResult(createEmptyStage5AuthoringState(), 'rec_1');
    expect(computeStage5Readiness(s)).toBe(false);
  });

  it('false when chosen is set but synthesis failed', () => {
    let s = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), []);
    s = applySynthesisFailure(s, 'boom');
    expect(computeStage5Readiness(s)).toBe(false);
  });

  it('true when chosen + synthesizedRecommendationId + status=synthesized all align', () => {
    let s = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), []);
    s = applySynthesisResult(s, 'rec_1');
    expect(computeStage5Readiness(s)).toBe(true);
  });
});
