// src/lib/ideation/stage-run-store/stage4-transitions.test.ts
//
// Focused tests for the Stage 4 commit transition's lazy-Stage-5
// upsert (mirroring the c1c493e pattern pinned for Stage 1 + Stage 2).
// The other Stage 4 persist helpers (Layer A / Layer B / community
// response / verdict / pushback) get exercised by their respective
// route + pipeline tests.

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

import { markStage4Committed } from './';

const { updateMany, findUnique, upsert } = mocks;

beforeEach(() => {
  updateMany.mockReset();
  findUnique.mockReset();
  upsert.mockReset();
});

describe('markStage4Committed — lazy Stage 5 row creation', () => {
  it('flips Stage 4 to committed AND upserts the Stage 5 row in one transaction', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    findUnique.mockResolvedValueOnce({ sessionId: 'sess_1', status: 'committed' });
    upsert.mockResolvedValueOnce({ id: 'run_5' });

    await markStage4Committed('run_4');

    // Stage 4 status write.
    const updateArg = updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(updateArg.where).toMatchObject({ id: 'run_4', status: 'output_ready', stageNumber: 4 });
    expect(updateArg.data).toMatchObject({ status: 'committed' });
    expect(updateArg.data.committedAt).toBeInstanceOf(Date);

    // Stage 5 upsert.
    expect(upsert).toHaveBeenCalledTimes(1);
    const upsertArg = upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({
      sessionId_stageNumber: { sessionId: 'sess_1', stageNumber: 5 },
    });
    expect(upsertArg.create).toMatchObject({
      sessionId:   'sess_1',
      stageNumber: 5,
      status:      'authoring',
    });
    // Stage 5 isn't built yet — `output` is omitted so the column
    // defaults to null.
    expect(upsertArg.create).not.toHaveProperty('output');
    // `update: {}` ensures pre-existing Stage 5 rows are never overwritten.
    expect(upsertArg.update).toEqual({});
  });

  it('still attempts the Stage 5 upsert when the row was already committed (self-heal)', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    findUnique.mockResolvedValueOnce({ sessionId: 'sess_1', status: 'committed' });
    upsert.mockResolvedValueOnce({ id: 'run_5' });

    await markStage4Committed('run_4');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('skips the Stage 5 upsert when the Stage 4 row never reached committed status', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    findUnique.mockResolvedValueOnce({ sessionId: 'sess_1', status: 'output_ready' });

    await markStage4Committed('run_4');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('skips the Stage 5 upsert when the row vanished mid-transaction', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    findUnique.mockResolvedValueOnce(null);

    await markStage4Committed('run_4');
    expect(upsert).not.toHaveBeenCalled();
  });
});
