// src/lib/ideation/stage-run-store/cross-stage-cascades.test.ts
//
// Critical-invariant tests for the cross-stage cascade contract:
//
//   Stage 1 /edit          → Stage 2 reverts to authoring with
//                            cascadeSnapshot + requiresRederivation
//   Stage 1 /discard-edit  → Stage 2 restores from cascadeSnapshot
//   Stage 1 /commit        → Stage 2 cascadeSnapshot is CLEARED
//                            (recommit invalidates the snapshot —
//                            later discard-edit must not resurrect
//                            stale state)
//
// We mock the Prisma client and verify each helper issues the right
// query shape. The invariants live in the helpers' where clauses
// and the JSON shape of the writes.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stub the validation helpers so we don't pull in next-auth.
vi.mock('@/lib/validation/server-helpers', () => {
  class HttpError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = 'HttpError';
    }
  }
  return { HttpError };
});

const mocks = vi.hoisted(() => ({
  findFirst:  vi.fn<(arg: unknown) => Promise<{ id: string; status: string; output: unknown } | null>>(),
  updateMany: vi.fn<(arg: { where?: Record<string, unknown>; data?: Record<string, unknown> }) => Promise<{ count: number }>>(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    ideationStageRun: {
      findFirst:  mocks.findFirst,
      updateMany: mocks.updateMany,
      findMany:   vi.fn(),
    },
  },
  toJsonValue: (x: unknown) => x,
}));

import {
  cascadeStage1EditToStage2,
  restoreStage2FromCascadeSnapshot,
  clearStage2CascadeSnapshot,
} from './cross-stage-cascades';
import type { RequirementsDocument, Stage2AuthoringState } from '../stage2-requirements/schema';
import { createEmptySkillInventory } from '../stage2-requirements/state';

const { findFirst, updateMany } = mocks;

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
});

function fakeRequirements(): RequirementsDocument {
  return {
    skillInventorySnapshot: createEmptySkillInventory(),
    expectedProfile: [{
      skill:        'sales',
      requiredTier: 'good',
      critical:     true,
      reasoning:    'r',
      sources:      ['lifestylePreference=fundable_startup'],
      pushback:     null,
    }],
    constraints: [],
    recommendedActions: [],
    structuralBlocker: { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
    researchLog: [],
    composedAt: '2026-05-12T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// cascadeStage1EditToStage2 — /edit on Stage 1 cascades to Stage 2
// ---------------------------------------------------------------------------

describe('cascadeStage1EditToStage2', () => {
  it('is a no-op when no Stage 2 row exists', async () => {
    findFirst.mockResolvedValueOnce(null);
    await cascadeStage1EditToStage2('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op when Stage 2 is already in authoring', async () => {
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'authoring', output: null });
    await cascadeStage1EditToStage2('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('reverts output_ready Stage 2 with a cascadeSnapshot carrying priorStatus="output_ready"', async () => {
    const prior = fakeRequirements();
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'output_ready', output: prior });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await cascadeStage1EditToStage2('sess_1', 'user_1');

    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 'run_2', stageNumber: 2 });
    expect(arg.data).toMatchObject({ status: 'authoring', committedAt: null });
    const written = arg.data?.output as Stage2AuthoringState;
    expect(written.cascadeSnapshot?.priorStatus).toBe('output_ready');
    expect(written.cascadeSnapshot?.document.composedAt).toBe(prior.composedAt);
    expect(written.requiresRederivation).toBe(true);
  });

  it('reverts committed Stage 2 with a cascadeSnapshot carrying priorStatus="committed"', async () => {
    const prior = fakeRequirements();
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'committed', output: prior });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await cascadeStage1EditToStage2('sess_1', 'user_1');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage2AuthoringState;
    expect(written.cascadeSnapshot?.priorStatus).toBe('committed');
    expect(written.requiresRederivation).toBe(true);
  });

  it('drops the cascade silently when prior output fails to parse', async () => {
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'committed', output: { wrong: 'shape' } });
    await cascadeStage1EditToStage2('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// restoreStage2FromCascadeSnapshot — /discard-edit on Stage 1 restores Stage 2
// ---------------------------------------------------------------------------

describe('restoreStage2FromCascadeSnapshot', () => {
  it('is a no-op when no Stage 2 row exists', async () => {
    findFirst.mockResolvedValueOnce(null);
    await restoreStage2FromCascadeSnapshot('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op when Stage 2 is not in authoring (already finalised)', async () => {
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'committed', output: null });
    await restoreStage2FromCascadeSnapshot('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op when authoring state has no cascadeSnapshot', async () => {
    const authoring: Stage2AuthoringState = {
      workingInventory:                createEmptySkillInventory(),
      workingExpectedProfile:          null,
      recommendedActions:              [],
      teamQuestionAsked:               false,
      requiresRederivation:            false,
      cascadeSnapshot:                 null,
      calibrationTurnsSinceLastUpdate: 0,
      structuralBlocker:               { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
      researchLog:                     [],
    };
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'authoring', output: authoring });
    await restoreStage2FromCascadeSnapshot('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('restores priorStatus="output_ready" without re-stamping committedAt', async () => {
    const doc = fakeRequirements();
    const authoring: Stage2AuthoringState = {
      workingInventory:                createEmptySkillInventory(),
      workingExpectedProfile:          null,
      recommendedActions:              [],
      teamQuestionAsked:               false,
      requiresRederivation:            true,
      cascadeSnapshot:                 { document: doc, priorStatus: 'output_ready' },
      calibrationTurnsSinceLastUpdate: 0,
      structuralBlocker:               { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
      researchLog:                     [],
    };
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'authoring', output: authoring });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await restoreStage2FromCascadeSnapshot('sess_1', 'user_1');

    const arg = updateMany.mock.calls[0][0];
    expect(arg.data).toMatchObject({ status: 'output_ready', committedAt: null });
  });

  it('restores priorStatus="committed" AND re-stamps committedAt', async () => {
    const doc = fakeRequirements();
    const authoring: Stage2AuthoringState = {
      workingInventory:                createEmptySkillInventory(),
      workingExpectedProfile:          null,
      recommendedActions:              [],
      teamQuestionAsked:               false,
      requiresRederivation:            true,
      cascadeSnapshot:                 { document: doc, priorStatus: 'committed' },
      calibrationTurnsSinceLastUpdate: 0,
      structuralBlocker:               { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
      researchLog:                     [],
    };
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'authoring', output: authoring });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await restoreStage2FromCascadeSnapshot('sess_1', 'user_1');

    const arg = updateMany.mock.calls[0][0];
    expect(arg.data?.status).toBe('committed');
    expect(arg.data?.committedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// clearStage2CascadeSnapshot — /commit on Stage 1 invalidates the snapshot
//
// THIS IS THE CRITICAL EDGE CASE: when Stage 1 recommits after an edit,
// the cascade snapshot's document was derived against a now-stale
// outcome. A later /discard-edit (on a separate row, or via some race)
// must not be able to resurrect stale Stage 2 state. The clear-on-
// recommit guarantee is what enforces that.
// ---------------------------------------------------------------------------

describe('clearStage2CascadeSnapshot — recommit clears snapshot', () => {
  it('is a no-op when no Stage 2 row exists', async () => {
    findFirst.mockResolvedValueOnce(null);
    await clearStage2CascadeSnapshot('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op when Stage 2 is not in authoring', async () => {
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'output_ready', output: null });
    await clearStage2CascadeSnapshot('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op when authoring state has no cascadeSnapshot', async () => {
    const authoring: Stage2AuthoringState = {
      workingInventory:                createEmptySkillInventory(),
      workingExpectedProfile:          null,
      recommendedActions:              [],
      teamQuestionAsked:               false,
      requiresRederivation:            false,
      cascadeSnapshot:                 null,
      calibrationTurnsSinceLastUpdate: 0,
      structuralBlocker:               { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
      researchLog:                     [],
    };
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'authoring', output: authoring });
    await clearStage2CascadeSnapshot('sess_1', 'user_1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('clears the snapshot when one exists (Stage 1 recommit case)', async () => {
    const doc = fakeRequirements();
    const authoring: Stage2AuthoringState = {
      workingInventory:                createEmptySkillInventory(),
      workingExpectedProfile:          null,
      recommendedActions:              [],
      teamQuestionAsked:               false,
      requiresRederivation:            true,
      cascadeSnapshot:                 { document: doc, priorStatus: 'committed' },
      calibrationTurnsSinceLastUpdate: 0,
      structuralBlocker:               { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
      researchLog:                     [],
    };
    findFirst.mockResolvedValueOnce({ id: 'run_2', status: 'authoring', output: authoring });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await clearStage2CascadeSnapshot('sess_1', 'user_1');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage2AuthoringState;
    expect(written.cascadeSnapshot).toBe(null);
    // requiresRederivation stays true — the founder still needs to
    // re-derive against the recommitted outcome.
    expect(written.requiresRederivation).toBe(true);
  });
});
