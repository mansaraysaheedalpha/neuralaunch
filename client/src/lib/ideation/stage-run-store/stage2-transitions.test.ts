// src/lib/ideation/stage-run-store/stage2-transitions.test.ts
//
// Focused tests for the commit-side invariant added in this batch:
// markStage2Committed now lazily creates the Stage 3 row in
// 'authoring' state inside the same transaction. The rest of the
// Stage 2 transitions (output-ready, canvas narrow writes, expected-
// profile entry write) are covered by the route-level integration
// surface and the engine tests in stage2-requirements/.

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

type UpsertArg = {
  where:  Record<string, unknown>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn<(arg: unknown) => Promise<{ count: number }>>(),
  findUnique: vi.fn<(arg: unknown) => Promise<unknown>>(),
  upsert:     vi.fn<(arg: UpsertArg) => Promise<unknown>>(),
}));

vi.mock('@/lib/prisma', () => {
  const ideationStageRun = {
    updateMany: mocks.updateMany,
    findUnique: mocks.findUnique,
    upsert:     mocks.upsert,
    findFirst:  vi.fn(),
    findMany:   vi.fn(),
    createMany: vi.fn(),
  };
  return {
    default: {
      ideationStageRun,
      $transaction: async (cb: (tx: { ideationStageRun: typeof ideationStageRun }) => Promise<unknown>) =>
        cb({ ideationStageRun }),
    },
    toJsonValue: (x: unknown) => x,
  };
});

import { markStage2Committed } from './';
import { createEmptySkillInventory } from '../stage2-requirements/state';

const { updateMany, findUnique, upsert } = mocks;

beforeEach(() => {
  updateMany.mockReset();
  findUnique.mockReset();
  upsert.mockReset();
});

// ---------------------------------------------------------------------------
// markStage2Committed — Stage 3 lazy-create on commit
// ---------------------------------------------------------------------------

describe('markStage2Committed — lazy Stage 3 row creation', () => {
  it('flips Stage 2 to committed AND upserts the Stage 3 row in one transaction', async () => {
    findUnique.mockResolvedValueOnce({
      output:      { existing: 'doc' },
      status:      'output_ready',
      stageNumber: 2,
      sessionId:   'sess_1',
    });
    updateMany.mockResolvedValueOnce({ count: 1 });
    upsert.mockResolvedValueOnce({ id: 'run_3' });

    await markStage2Committed('run_2', createEmptySkillInventory());

    // Stage 2 status write.
    expect(updateMany).toHaveBeenCalledTimes(1);
    const updateArg = updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(updateArg.where).toMatchObject({ id: 'run_2', status: 'output_ready', stageNumber: 2 });
    expect(updateArg.data).toMatchObject({ status: 'committed' });

    // Stage 3 upsert.
    expect(upsert).toHaveBeenCalledTimes(1);
    const upsertArg = upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({
      sessionId_stageNumber: { sessionId: 'sess_1', stageNumber: 3 },
    });
    expect(upsertArg.create).toMatchObject({
      sessionId:   'sess_1',
      stageNumber: 3,
      status:      'authoring',
    });
    // Empty Stage 3 authoring state seeded via toJsonValue.
    expect(upsertArg.create.output).toBeDefined();
    expect(upsertArg.update).toEqual({});
  });

  it('skips both writes when the Stage 2 row is not in output_ready', async () => {
    findUnique.mockResolvedValueOnce({
      output:      { existing: 'doc' },
      status:      'committed',
      stageNumber: 2,
      sessionId:   'sess_1',
    });

    await markStage2Committed('run_2', createEmptySkillInventory());

    // Neither write fires — already committed.
    expect(updateMany).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("skips both writes when the row doesn't exist", async () => {
    findUnique.mockResolvedValueOnce(null);
    await markStage2Committed('run_2', createEmptySkillInventory());
    expect(updateMany).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
