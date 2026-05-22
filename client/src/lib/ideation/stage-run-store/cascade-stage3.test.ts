// src/lib/ideation/stage-run-store/cascade-stage3.test.ts
//
// Three-rule state-machine tests for the Stage 3 cross-stage cascade.
// Covers all seven canonical scenarios from docs/stage3-handoff.md
// § 2.1:
//
//   S1 only edit             — single trigger, snapshot taken
//   S2 only edit             — single trigger from Stage 2 source
//   S1 + S2 edit             — second edit just appends to triggeringStages
//   Only S1 discharges       — list still has S2, snapshot kept, status authoring
//   Only S2 discharges       — list still has S1, snapshot kept, status authoring
//   Both discharge           — list empties, restore from snapshot
//   Recommit (from S1 or S2) — snapshot nulled entirely + requiresRederivation
//
// We mock prisma + validation helpers to keep tests pure.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
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
  cascadeStage1OrStage2EditToStage3,
  restoreStage3FromCascadeSnapshot,
  clearStage3CascadeSnapshot,
} from './cross-stage-cascades';
import type {
  PainInventoryDocument,
  Stage3AuthoringState,
} from '../stage3-opportunities/schema';

const { findFirst, updateMany } = mocks;

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeInventory(): PainInventoryDocument {
  return {
    painPointsSnapshot: [],
    shortlist:          [],
    shortlistFloor:     3,
    shortlistTarget:    5,
    shortlistCap:       5,
    rulesOut:           'placeholder',
    recommendedActions: [],
    researchLog:        [],
    composedAt:         '2026-05-12T00:00:00.000Z',
  };
}

function emptyAuthoring(over: Partial<Stage3AuthoringState> = {}): Stage3AuthoringState {
  return {
    agentPainPoints:      [],
    founderPainPoints:    [],
    recommendedActions:   [],
    researchLog:          [],
    scoutRunCount:        0,
    cascadeSnapshot:      null,
    requiresRederivation: false,
    ...over,
  };
}

// ===========================================================================
// Rule 1: /edit from an upstream stage
// ===========================================================================

describe('cascadeStage1OrStage2EditToStage3 — Branch A (committed/output_ready → revert + snapshot)', () => {
  it('is a no-op when no Stage 3 row exists', async () => {
    findFirst.mockResolvedValueOnce(null);
    await cascadeStage1OrStage2EditToStage3('sess_1', 'user_1', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("reverts a committed Stage 3 with triggeringStages=['stage1']", async () => {
    const prior = fakeInventory();
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'committed', output: prior });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await cascadeStage1OrStage2EditToStage3('sess_1', 'user_1', 'stage1');

    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 'run_3', stageNumber: 3 });
    expect(arg.data).toMatchObject({ status: 'authoring', committedAt: null });
    const written = arg.data?.output as Stage3AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage1']);
    expect(written.cascadeSnapshot?.document.composedAt).toBe(prior.composedAt);
    expect(written.requiresRederivation).toBe(true);
    // Inventory is cleared; founder rebuilds from scratch on re-derive.
    expect(written.agentPainPoints).toEqual([]);
    expect(written.founderPainPoints).toEqual([]);
  });

  it("reverts an output_ready Stage 3 with triggeringStages=['stage2']", async () => {
    const prior = fakeInventory();
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'output_ready', output: prior });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await cascadeStage1OrStage2EditToStage3('sess_1', 'user_1', 'stage2');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage3AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage2']);
  });

  it('drops the cascade silently when prior output fails to parse', async () => {
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'committed', output: { wrong: 'shape' } });
    await cascadeStage1OrStage2EditToStage3('sess_1', 'user_1', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('cascadeStage1OrStage2EditToStage3 — Branch B (already in cascade authoring → append to triggeringStages)', () => {
  it("appends 'stage2' to existing ['stage1'] cascade", async () => {
    const prior = fakeInventory();
    const authoring = emptyAuthoring({
      cascadeSnapshot: {
        document:         prior,
        triggeringStages: ['stage1'],
        snapshottedAt:    '2026-05-12T00:00:00.000Z',
      },
      requiresRederivation: true,
    });
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'authoring', output: authoring });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await cascadeStage1OrStage2EditToStage3('sess_1', 'user_1', 'stage2');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage3AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage1', 'stage2']);
  });

  it("is idempotent — duplicate firing of the same triggering stage is a no-op", async () => {
    const prior = fakeInventory();
    const authoring = emptyAuthoring({
      cascadeSnapshot: {
        document:         prior,
        triggeringStages: ['stage1'],
        snapshottedAt:    '2026-05-12T00:00:00.000Z',
      },
    });
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'authoring', output: authoring });

    await cascadeStage1OrStage2EditToStage3('sess_1', 'user_1', 'stage1');

    expect(updateMany).not.toHaveBeenCalled();
  });

  // The "no-op when authoring has no snapshot" assertion previously
  // lived here; that behavior was the audit-gap fix target. The new
  // shape (flip requiresRederivation=true in that case) is covered
  // by the dedicated describe block at the bottom of this file.
});

// ===========================================================================
// Rule 2: /discard-edit from an upstream stage
// ===========================================================================

describe('restoreStage3FromCascadeSnapshot — partial discharge keeps snapshot', () => {
  it("removes one stage from triggeringStages but keeps the snapshot when others remain", async () => {
    const prior = fakeInventory();
    const authoring = emptyAuthoring({
      cascadeSnapshot: {
        document:         prior,
        triggeringStages: ['stage1', 'stage2'],
        snapshottedAt:    '2026-05-12T00:00:00.000Z',
      },
      requiresRederivation: true,
    });
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'authoring', output: authoring });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await restoreStage3FromCascadeSnapshot('sess_1', 'user_1', 'stage1');

    const arg = updateMany.mock.calls[0][0];
    // Status stays 'authoring' (no status field in update means authoring filter holds).
    expect(arg.data?.status).toBeUndefined();
    const written = arg.data?.output as Stage3AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage2']);
  });
});

describe('restoreStage3FromCascadeSnapshot — full discharge restores from snapshot', () => {
  it("when list empties, restores the document and flips status to output_ready", async () => {
    const prior = fakeInventory();
    const authoring = emptyAuthoring({
      cascadeSnapshot: {
        document:         prior,
        triggeringStages: ['stage1'],
        snapshottedAt:    '2026-05-12T00:00:00.000Z',
      },
      requiresRederivation: true,
    });
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'authoring', output: authoring });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await restoreStage3FromCascadeSnapshot('sess_1', 'user_1', 'stage1');

    const arg = updateMany.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      status:      'output_ready',
      committedAt: null,
    });
    // Output is the restored document, not an authoring envelope.
    expect(arg.data?.output).toMatchObject({ composedAt: prior.composedAt });
  });

  it("is a no-op when the discharging stage is not in the triggeringStages list", async () => {
    const prior = fakeInventory();
    const authoring = emptyAuthoring({
      cascadeSnapshot: {
        document:         prior,
        triggeringStages: ['stage1'],
        snapshottedAt:    '2026-05-12T00:00:00.000Z',
      },
    });
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'authoring', output: authoring });

    await restoreStage3FromCascadeSnapshot('sess_1', 'user_1', 'stage2');

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("is a no-op when Stage 3 row doesn't exist", async () => {
    findFirst.mockResolvedValueOnce(null);
    await restoreStage3FromCascadeSnapshot('sess_1', 'user_1', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Rule 3: /commit (recommit) from an upstream stage
// ===========================================================================

describe('clearStage3CascadeSnapshot — recommit invalidates the snapshot entirely', () => {
  it("NULLs the snapshot AND keeps requiresRederivation=true when the triggering stage matches", async () => {
    const prior = fakeInventory();
    const authoring = emptyAuthoring({
      cascadeSnapshot: {
        document:         prior,
        triggeringStages: ['stage1', 'stage2'],
        snapshottedAt:    '2026-05-12T00:00:00.000Z',
      },
      requiresRederivation: true,
    });
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'authoring', output: authoring });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await clearStage3CascadeSnapshot('sess_1', 'user_1', 'stage1');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage3AuthoringState;
    expect(written.cascadeSnapshot).toBeNull();
    expect(written.requiresRederivation).toBe(true);
  });

  it("is a no-op when the triggering stage isn't in the list", async () => {
    const prior = fakeInventory();
    const authoring = emptyAuthoring({
      cascadeSnapshot: {
        document:         prior,
        triggeringStages: ['stage2'],
        snapshottedAt:    '2026-05-12T00:00:00.000Z',
      },
    });
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'authoring', output: authoring });
    await clearStage3CascadeSnapshot('sess_1', 'user_1', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("is a no-op when Stage 3 isn't in cascade authoring", async () => {
    findFirst.mockResolvedValueOnce({ id: 'run_3', status: 'committed', output: fakeInventory() });
    await clearStage3CascadeSnapshot('sess_1', 'user_1', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("is a no-op when Stage 3 doesn't exist", async () => {
    findFirst.mockResolvedValueOnce(null);
    await clearStage3CascadeSnapshot('sess_1', 'user_1', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Branch C — normal authoring without snapshot. Audit-gap fix.
// ---------------------------------------------------------------------------

describe('cascadeStage1OrStage2EditToStage3 — normal authoring (no snapshot)', () => {
  function normalAuthoring(): Stage3AuthoringState {
    return {
      agentPainPoints:      [],
      founderPainPoints:    [],
      recommendedActions:   [],
      researchLog:          [],
      scoutRunCount:        0,
      cascadeSnapshot:      null,
      requiresRederivation: false,
    };
  }

  it('flips requiresRederivation=true when Stage 3 is in normal authoring', async () => {
    findFirst.mockResolvedValueOnce({ id: 's3', status: 'authoring', output: normalAuthoring() });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await cascadeStage1OrStage2EditToStage3('sess_1', 'user_1', 'stage1');

    const written = updateMany.mock.calls[0][0].data?.output as Stage3AuthoringState;
    expect(written.requiresRederivation).toBe(true);
    expect(written.cascadeSnapshot).toBeNull();
  });

  it('is a no-op when requiresRederivation is already true', async () => {
    findFirst.mockResolvedValueOnce({
      id: 's3',
      status: 'authoring',
      output: { ...normalAuthoring(), requiresRederivation: true },
    });
    await cascadeStage1OrStage2EditToStage3('sess_1', 'user_1', 'stage2');
    expect(updateMany).not.toHaveBeenCalled();
  });
});
