// src/lib/ideation/stage2-requirements/state.test.ts
//
// Stage 2 state-machine tests. Mirrors the Stage 1 state.test.ts:
// confidence/tier merge, recommended-action FIFO + dedup, structural-
// blocker derivation, readiness gate, safeParse corruption handling.
// All pure functions; no mocks.

import { describe, it, expect } from 'vitest';
import {
  createEmptyStage2AuthoringState,
  createEmptySkillInventory,
  createEmptyPersonSkills,
  applyStage2Extractions,
  applySkillUpdate,
  applyTeammateOp,
  appendStage2RecommendedAction,
  computeStructuralBlocker,
  computeStage2Readiness,
  safeParseStage2AuthoringState,
  safeParseRequirementsDocument,
  safeParseSkillInventory,
} from './state';
import type { Constraint, StructuralBlocker } from './schema';
import type { RecommendedAction } from '../stage1-outcome/schema';
import { MAX_RECOMMENDED_ACTIONS_STAGE2, STRUCTURAL_BLOCKER_THRESHOLD } from './constants';

// ---------------------------------------------------------------------------
// Empty factories
// ---------------------------------------------------------------------------

describe('createEmptySkillInventory', () => {
  it('starts founder with all 14 skills at unknown', () => {
    const inv = createEmptySkillInventory();
    expect(Object.values(inv.founder.tiers).every(t => t === 'unknown')).toBe(true);
    expect(Object.keys(inv.founder.tiers)).toHaveLength(14);
  });
  it('starts team empty', () => {
    expect(createEmptySkillInventory().team).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applySkillUpdate / applyTeammateOp
// ---------------------------------------------------------------------------

describe('applySkillUpdate', () => {
  it('writes founder tier', () => {
    const inv = applySkillUpdate(createEmptySkillInventory(), {
      person: 'founder', skill: 'sales', tier: 'good',
    });
    expect(inv.founder.tiers.sales).toBe('good');
  });

  it('writes teammate tier by index', () => {
    let inv = createEmptySkillInventory();
    inv = applyTeammateOp(inv, { op: 'add', name: 'Maya' });
    inv = applySkillUpdate(inv, { person: 0, skill: 'programming', tier: 'good' });
    expect(inv.team[0].tiers.programming).toBe('good');
  });

  it('silently drops out-of-range teammate index', () => {
    const inv = createEmptySkillInventory();
    const next = applySkillUpdate(inv, { person: 5, skill: 'sales', tier: 'good' });
    expect(next).toEqual(inv);
  });
});

describe('applyTeammateOp', () => {
  it('adds a teammate with all-unknown tiers', () => {
    const inv = applyTeammateOp(createEmptySkillInventory(), { op: 'add', name: 'Maya' });
    expect(inv.team).toHaveLength(1);
    expect(inv.team[0].name).toBe('Maya');
    expect(Object.values(inv.team[0].tiers).every(t => t === 'unknown')).toBe(true);
  });

  it('removes by index, shifting subsequent', () => {
    let inv = createEmptySkillInventory();
    inv = applyTeammateOp(inv, { op: 'add', name: 'Maya' });
    inv = applyTeammateOp(inv, { op: 'add', name: 'Tom' });
    inv = applyTeammateOp(inv, { op: 'remove', index: 0 });
    expect(inv.team).toHaveLength(1);
    expect(inv.team[0].name).toBe('Tom');
  });

  it('renames in place', () => {
    let inv = applyTeammateOp(createEmptySkillInventory(), { op: 'add', name: 'Maya' });
    inv = applyTeammateOp(inv, { op: 'rename', index: 0, name: 'Maya Patel' });
    expect(inv.team[0].name).toBe('Maya Patel');
  });

  it("noop on out-of-range remove/rename", () => {
    const inv = createEmptySkillInventory();
    expect(applyTeammateOp(inv, { op: 'remove', index: 5 })).toEqual(inv);
    expect(applyTeammateOp(inv, { op: 'rename', index: 5, name: 'X' })).toEqual(inv);
  });
});

// ---------------------------------------------------------------------------
// applyStage2Extractions — drift counter semantics
// ---------------------------------------------------------------------------

describe('applyStage2Extractions — drift counter', () => {
  it('resets to 0 when any tier changes', () => {
    const state = { ...createEmptyStage2AuthoringState(), calibrationTurnsSinceLastUpdate: 3 };
    const next = applyStage2Extractions(state, [
      { person: 'founder', skill: 'sales', tier: 'good' },
    ], []);
    expect(next.calibrationTurnsSinceLastUpdate).toBe(0);
  });

  it('resets to 0 when a new teammate is added', () => {
    const state = { ...createEmptyStage2AuthoringState(), calibrationTurnsSinceLastUpdate: 2 };
    const next = applyStage2Extractions(state, [], ['Maya']);
    expect(next.calibrationTurnsSinceLastUpdate).toBe(0);
  });

  it('increments when nothing changes', () => {
    const state = { ...createEmptyStage2AuthoringState(), calibrationTurnsSinceLastUpdate: 1 };
    // Founder skill already at unknown; setting unknown is a noop
    const next = applyStage2Extractions(state, [
      { person: 'founder', skill: 'sales', tier: 'unknown' },
    ], []);
    expect(next.calibrationTurnsSinceLastUpdate).toBe(2);
  });

  it('drops orphan teammate references silently', () => {
    const state = createEmptyStage2AuthoringState();
    // index 5 doesn't exist; should be applied as noop
    const next = applyStage2Extractions(state, [
      { person: 99, skill: 'sales', tier: 'good' },
    ], []);
    expect(next.workingInventory.team).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// appendStage2RecommendedAction — dedup + FIFO
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

describe('appendStage2RecommendedAction', () => {
  it('appends a new action', () => {
    const state = appendStage2RecommendedAction(createEmptyStage2AuthoringState(), action());
    expect(state.recommendedActions).toHaveLength(1);
  });

  it('dedups by case-insensitive trimmed text', () => {
    let s = appendStage2RecommendedAction(createEmptyStage2AuthoringState(), action({ action: 'Talk To Three People' }));
    s = appendStage2RecommendedAction(s, action({ action: 'talk to three people  ' }));
    expect(s.recommendedActions).toHaveLength(1);
  });

  it('FIFO evicts the oldest non-completed entry once cap is hit, keeping completed sticky', () => {
    let s = createEmptyStage2AuthoringState();
    s = appendStage2RecommendedAction(s, action({ action: 'completed-action', status: 'completed' }));
    for (let i = 0; i < MAX_RECOMMENDED_ACTIONS_STAGE2 - 1; i++) {
      s = appendStage2RecommendedAction(s, action({ action: `pending ${i}` }));
    }
    expect(s.recommendedActions).toHaveLength(MAX_RECOMMENDED_ACTIONS_STAGE2);
    s = appendStage2RecommendedAction(s, action({ action: 'newest' }));
    expect(s.recommendedActions[0].action).toBe('completed-action');
    expect(s.recommendedActions.some(a => a.action === 'newest')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeStructuralBlocker
// ---------------------------------------------------------------------------

function constraint(over: Partial<Constraint> = {}): Constraint {
  return {
    skill: 'sales', requiredTier: 'good', actualTier: 'bad',
    gap: 'structural', critical: true, implication: '',
    ...over,
  };
}

const NOT_YET: StructuralBlocker = { triggered: false, founderChoice: 'not_yet_chosen', notes: null };

describe('computeStructuralBlocker', () => {
  it(`triggers when >= ${STRUCTURAL_BLOCKER_THRESHOLD} critical structural/blind constraints exist`, () => {
    const constraints = [
      constraint({ skill: 'sales', gap: 'structural', critical: true }),
      constraint({ skill: 'programming', gap: 'blind_spot', critical: true }),
    ];
    const blocker = computeStructuralBlocker(NOT_YET, constraints);
    expect(blocker.triggered).toBe(true);
  });

  it('does NOT trigger when only mild gaps exist', () => {
    const constraints = [
      constraint({ gap: 'mild', critical: true }),
      constraint({ gap: 'mild', critical: true }),
    ];
    expect(computeStructuralBlocker(NOT_YET, constraints).triggered).toBe(false);
  });

  it('does NOT count non-critical structural gaps', () => {
    const constraints = [
      constraint({ gap: 'structural', critical: false }),
      constraint({ gap: 'structural', critical: false }),
    ];
    expect(computeStructuralBlocker(NOT_YET, constraints).triggered).toBe(false);
  });

  it('preserves a real founder choice when triggered drops back to false', () => {
    const prior: StructuralBlocker = { triggered: true, founderChoice: 'plan_team_recruit', notes: 'planning' };
    const next = computeStructuralBlocker(prior, []);  // no constraints → not triggered
    expect(next.triggered).toBe(false);
    expect(next.founderChoice).toBe('plan_team_recruit');  // preserved
    expect(next.notes).toBe('planning');
  });

  it('clears not_yet_chosen state when triggered drops', () => {
    const prior: StructuralBlocker = { triggered: true, founderChoice: 'not_yet_chosen', notes: null };
    const next = computeStructuralBlocker(prior, []);
    expect(next.triggered).toBe(false);
    expect(next.founderChoice).toBe('not_yet_chosen');
  });
});

// ---------------------------------------------------------------------------
// computeStage2Readiness
// ---------------------------------------------------------------------------

describe('computeStage2Readiness', () => {
  it('returns false when turn count is below MIN_SKILL_CALIBRATION_TURNS', () => {
    const state = {
      ...createEmptyStage2AuthoringState(),
      workingExpectedProfile: [{
        skill: 'sales' as const, requiredTier: 'good' as const, critical: true,
        reasoning: 'x', sources: [], pushback: null,
      }],
    };
    expect(computeStage2Readiness(state, 1)).toBe(false);
  });

  it('returns false when Expected Profile is null', () => {
    const state = createEmptyStage2AuthoringState();
    expect(computeStage2Readiness(state, 10)).toBe(false);
  });

  it('returns true when both gates pass', () => {
    const state = {
      ...createEmptyStage2AuthoringState(),
      workingExpectedProfile: [{
        skill: 'sales' as const, requiredTier: 'good' as const, critical: true,
        reasoning: 'x', sources: [], pushback: null,
      }],
    };
    expect(computeStage2Readiness(state, 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// safeParse corruption handling
// ---------------------------------------------------------------------------

describe('safeParseStage2AuthoringState', () => {
  it('returns empty state on null/undefined/malformed', () => {
    expect(safeParseStage2AuthoringState(null).workingInventory.team).toEqual([]);
    expect(safeParseStage2AuthoringState({ wrong: 'shape' }).workingExpectedProfile).toBe(null);
  });
});

describe('safeParseRequirementsDocument', () => {
  it('returns null on malformed input', () => {
    expect(safeParseRequirementsDocument(null)).toBe(null);
    expect(safeParseRequirementsDocument({ wrong: 'shape' })).toBe(null);
  });
});

describe('safeParseSkillInventory', () => {
  it('returns null on malformed input', () => {
    expect(safeParseSkillInventory(null)).toBe(null);
    expect(safeParseSkillInventory({ wrong: 'shape' })).toBe(null);
  });
  it('round-trips a valid inventory', () => {
    const inv = createEmptySkillInventory();
    inv.team = [createEmptyPersonSkills('Maya')];
    const parsed = safeParseSkillInventory(JSON.parse(JSON.stringify(inv)));
    expect(parsed?.team).toHaveLength(1);
  });
});
