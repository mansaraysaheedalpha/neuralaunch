// src/lib/ideation/stage3-opportunities/state.test.ts
//
// Pure-function tests for Stage 3 state-machine helpers. No mocks
// (server-only / next-auth not imported transitively from state.ts).

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createEmptyStage3AuthoringState,
  safeParseStage3AuthoringState,
  safeParsePainInventoryDocument,
  computeCombinedScore,
  applyFounderScores,
  buildPainPoint,
  appendPainPoint,
  removePainPointById,
  replacePainPointById,
  appendStage3RecommendedAction,
  allPainPoints,
  viableForShortlist,
  computeStage3Readiness,
} from './state';
import {
  MIN_PAIN_POINTS_FOR_COMMIT,
  MAX_RECOMMENDED_ACTIONS_STAGE3,
  EVIDENCE_EXCERPT_MAX_CHARS,
} from './constants';
import type { PainPoint } from './schema';
import type { RecommendedAction } from '../stage1-outcome/schema';

// ---------------------------------------------------------------------------
// Empty factories + safeParse fallbacks
// ---------------------------------------------------------------------------

describe('createEmptyStage3AuthoringState', () => {
  it('starts every list empty + counters zero', () => {
    const s = createEmptyStage3AuthoringState();
    expect(s.agentPainPoints).toEqual([]);
    expect(s.founderPainPoints).toEqual([]);
    expect(s.recommendedActions).toEqual([]);
    expect(s.researchLog).toEqual([]);
    expect(s.scoutRunCount).toBe(0);
    expect(s.cascadeSnapshot).toBeNull();
    expect(s.requiresRederivation).toBe(false);
  });
});

describe('safeParseStage3AuthoringState', () => {
  it('returns the canonical empty state for null', () => {
    expect(safeParseStage3AuthoringState(null)).toEqual(createEmptyStage3AuthoringState());
  });
  it('returns the canonical empty state for malformed JSON', () => {
    expect(safeParseStage3AuthoringState({ wrong: 'shape' }))
      .toEqual(createEmptyStage3AuthoringState());
  });
  it('round-trips a well-formed state', () => {
    const s = createEmptyStage3AuthoringState();
    expect(safeParseStage3AuthoringState(s)).toEqual(s);
  });
});

describe('safeParsePainInventoryDocument', () => {
  it('returns null when value is corrupt', () => {
    expect(safeParsePainInventoryDocument({ garbage: true })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeCombinedScore — multiplicative, returns null when scores absent
// ---------------------------------------------------------------------------

describe('computeCombinedScore', () => {
  it('returns null when scores are null', () => {
    expect(computeCombinedScore(null)).toBeNull();
  });
  it('multiplies the three axes', () => {
    expect(computeCombinedScore({ intensity: 5, frequency: 4, nicheSpecificity: 3 })).toBe(60);
  });
  it('floor is 1 (all 1s)', () => {
    expect(computeCombinedScore({ intensity: 1, frequency: 1, nicheSpecificity: 1 })).toBe(1);
  });
  it('ceiling is 125 (all 5s)', () => {
    expect(computeCombinedScore({ intensity: 5, frequency: 5, nicheSpecificity: 5 })).toBe(125);
  });
});

// ---------------------------------------------------------------------------
// applyFounderScores — clamps + recomputes combinedScore + sets status='rated'
// ---------------------------------------------------------------------------

describe('applyFounderScores', () => {
  it("clamps out-of-range scores into [1, 5] and rounds non-integers", () => {
    const pp = buildPainPoint({
      source: 'founder', description: 'x', founderContext: 'own_life', founderNotes: null,
    });
    const next = applyFounderScores(pp, { intensity: 9, frequency: 0, nicheSpecificity: 3.6 });
    expect(next.founderFinalScores).toEqual({ intensity: 5, frequency: 1, nicheSpecificity: 4 });
    expect(next.combinedScore).toBe(5 * 1 * 4);
    expect(next.status).toBe('rated');
  });
});

// ---------------------------------------------------------------------------
// buildPainPoint — id + source + initial fields
// ---------------------------------------------------------------------------

describe('buildPainPoint', () => {
  it("starts agent-sourced points unrated with scorePushbackVersion=0", () => {
    const pp = buildPainPoint({
      source: 'agent',
      description: 'd',
      evidenceUrl: null,
      evidenceExcerpt: null,
      communityOrigin: null,
      agentRelevanceNote: 'r',
      agentSuggestedScores: { intensity: 3, frequency: 3, nicheSpecificity: 3, reasoningPerMetric: 'r' },
    });
    expect(pp.source).toBe('agent');
    expect(pp.status).toBe('pending_rating');
    expect(pp.scorePushbackVersion).toBe(0);
    expect(pp.combinedScore).toBeNull();
    expect(pp.id.length).toBeGreaterThan(0);
  });

  it("clamps evidenceExcerpt to EVIDENCE_EXCERPT_MAX_CHARS", () => {
    const long = 'a'.repeat(EVIDENCE_EXCERPT_MAX_CHARS + 100);
    const pp = buildPainPoint({
      source: 'agent',
      description: 'd',
      evidenceUrl: null,
      evidenceExcerpt: long,
      communityOrigin: null,
      agentRelevanceNote: 'r',
      agentSuggestedScores: null,
    });
    expect(pp.evidenceExcerpt!.length).toBeLessThanOrEqual(EVIDENCE_EXCERPT_MAX_CHARS);
  });

  it("assigns unique ids across two calls", () => {
    const a = buildPainPoint({ source: 'founder', description: 'a', founderContext: null, founderNotes: null });
    const b = buildPainPoint({ source: 'founder', description: 'b', founderContext: null, founderNotes: null });
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// appendPainPoint / removePainPointById / replacePainPointById
// ---------------------------------------------------------------------------

describe('appendPainPoint', () => {
  it("appends to agentPainPoints when source='agent'", () => {
    const pp = buildPainPoint({
      source: 'agent', description: 'd',
      evidenceUrl: null, evidenceExcerpt: null,
      communityOrigin: null, agentRelevanceNote: 'r',
      agentSuggestedScores: null,
    });
    const next = appendPainPoint(createEmptyStage3AuthoringState(), pp);
    expect(next.agentPainPoints).toHaveLength(1);
    expect(next.founderPainPoints).toHaveLength(0);
  });

  it("appends to founderPainPoints when source='founder'", () => {
    const pp = buildPainPoint({
      source: 'founder', description: 'd',
      founderContext: 'own_life', founderNotes: null,
    });
    const next = appendPainPoint(createEmptyStage3AuthoringState(), pp);
    expect(next.founderPainPoints).toHaveLength(1);
    expect(next.agentPainPoints).toHaveLength(0);
  });
});

describe('removePainPointById', () => {
  it("removes from whichever bucket it lives in", () => {
    let s = createEmptyStage3AuthoringState();
    const pp = buildPainPoint({
      source: 'founder', description: 'x', founderContext: null, founderNotes: null,
    });
    s = appendPainPoint(s, pp);
    s = removePainPointById(s, pp.id);
    expect(s.founderPainPoints).toEqual([]);
  });

  it("is idempotent for unknown ids", () => {
    const s = createEmptyStage3AuthoringState();
    expect(removePainPointById(s, 'nonexistent')).toEqual(s);
  });
});

describe('replacePainPointById', () => {
  it("replaces by id in the founder bucket", () => {
    let s = createEmptyStage3AuthoringState();
    const pp = buildPainPoint({
      source: 'founder', description: 'old', founderContext: null, founderNotes: null,
    });
    s = appendPainPoint(s, pp);
    const updated: PainPoint = { ...pp, description: 'new' };
    s = replacePainPointById(s, pp.id, updated);
    expect(s.founderPainPoints[0].description).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// appendStage3RecommendedAction — FIFO + sticky completed + dedup merge
// ---------------------------------------------------------------------------

describe('appendStage3RecommendedAction', () => {
  function action(over: Partial<RecommendedAction> = {}): RecommendedAction {
    return {
      action:          'do thing',
      severity:        'suggested',
      raisedAt:        new Date().toISOString(),
      status:          'pending',
      founderResponse: null,
      ...over,
    };
  }

  it("merges duplicates (case-insensitive description) instead of duplicating", () => {
    let s = createEmptyStage3AuthoringState();
    s = appendStage3RecommendedAction(s, action({ action: 'Talk to 5 people' }));
    s = appendStage3RecommendedAction(s, action({ action: 'talk to 5 people', severity: 'strongly_advised' }));
    expect(s.recommendedActions).toHaveLength(1);
    expect(s.recommendedActions[0].severity).toBe('strongly_advised');
  });

  it("FIFOs once the cap is reached, preferring to evict non-completed entries first", () => {
    let s = createEmptyStage3AuthoringState();
    // Fill to cap with 'pending' entries.
    for (let i = 0; i < MAX_RECOMMENDED_ACTIONS_STAGE3; i++) {
      s = appendStage3RecommendedAction(s, action({ action: `a${i}` }));
    }
    expect(s.recommendedActions).toHaveLength(MAX_RECOMMENDED_ACTIONS_STAGE3);
    // Mark the first as completed, then append one more — eviction
    // should target the first non-completed slot.
    s = {
      ...s,
      recommendedActions: s.recommendedActions.map((a, i) =>
        i === 0 ? { ...a, status: 'completed' as const } : a,
      ),
    };
    s = appendStage3RecommendedAction(s, action({ action: 'new-tail' }));
    expect(s.recommendedActions).toHaveLength(MAX_RECOMMENDED_ACTIONS_STAGE3);
    // The completed-status row at idx 0 should still be present.
    expect(s.recommendedActions[0].status).toBe('completed');
    // The new entry sits at the tail.
    expect(s.recommendedActions.at(-1)?.action).toBe('new-tail');
  });
});

// ---------------------------------------------------------------------------
// viableForShortlist + computeStage3Readiness
// ---------------------------------------------------------------------------

describe('viableForShortlist', () => {
  it("excludes pending_rating + rejected_by_founder + null combinedScore", () => {
    let s = createEmptyStage3AuthoringState();
    const baseFounder = buildPainPoint({
      source: 'founder', description: 'a', founderContext: null, founderNotes: null,
    });
    // 3 rated, 1 pending.
    for (const desc of ['a', 'b', 'c', 'd']) {
      const pp = buildPainPoint({
        source: 'founder', description: desc, founderContext: null, founderNotes: null,
      });
      s = appendPainPoint(s, pp);
    }
    // Rate the first three.
    s = {
      ...s,
      founderPainPoints: s.founderPainPoints.map((pp, i) =>
        i < 3 ? applyFounderScores(pp, { intensity: 4, frequency: 3, nicheSpecificity: 2 }) : pp,
      ),
    };
    void baseFounder;
    expect(viableForShortlist(s)).toHaveLength(3);
  });
});

describe('computeStage3Readiness', () => {
  it(`is false below ${MIN_PAIN_POINTS_FOR_COMMIT} viable rated`, () => {
    let s = createEmptyStage3AuthoringState();
    const pp = buildPainPoint({
      source: 'founder', description: 'a', founderContext: null, founderNotes: null,
    });
    const rated = applyFounderScores(pp, { intensity: 5, frequency: 5, nicheSpecificity: 5 });
    s = appendPainPoint(s, rated);
    expect(computeStage3Readiness(s)).toBe(false);
  });

  it(`is true at ${MIN_PAIN_POINTS_FOR_COMMIT} viable rated`, () => {
    let s = createEmptyStage3AuthoringState();
    for (let i = 0; i < MIN_PAIN_POINTS_FOR_COMMIT; i++) {
      const pp = buildPainPoint({
        source: 'founder', description: `a${i}`, founderContext: null, founderNotes: null,
      });
      s = appendPainPoint(s, applyFounderScores(pp, { intensity: 3, frequency: 3, nicheSpecificity: 3 }));
    }
    expect(computeStage3Readiness(s)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// allPainPoints — orders agent before founder
// ---------------------------------------------------------------------------

describe('allPainPoints', () => {
  it("concatenates agent then founder buckets", () => {
    let s = createEmptyStage3AuthoringState();
    const agent = buildPainPoint({
      source: 'agent', description: 'a',
      evidenceUrl: null, evidenceExcerpt: null,
      communityOrigin: null, agentRelevanceNote: 'r',
      agentSuggestedScores: null,
    });
    const founder = buildPainPoint({
      source: 'founder', description: 'f', founderContext: null, founderNotes: null,
    });
    s = appendPainPoint(s, agent);
    s = appendPainPoint(s, founder);
    const all = allPainPoints(s);
    expect(all[0].source).toBe('agent');
    expect(all[1].source).toBe('founder');
  });
});
