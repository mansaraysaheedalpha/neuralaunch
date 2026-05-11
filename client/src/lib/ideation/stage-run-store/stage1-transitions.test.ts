// src/lib/ideation/stage-run-store/stage1-transitions.test.ts
//
// Lifecycle invariants for the Stage 1 IdeationStageRun transitions.
// We mock the Prisma client and verify each helper issues the right
// query shape — the value being that the invariants live in the
// helpers' where clauses (status transitions, ownership scope,
// snapshot priorStatus preservation) rather than at the DB level
// (Prisma can't express CHECK constraints natively).
//
// `createInitialStageRunsForNoIdea` is the shared no_idea bootstrap
// helper that lives in the folder's index.ts; it's exercised here too
// because Stages 0 and 1 always co-occur for no_idea sessions.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  OutcomeDocument,
  PriorCommittedSnapshot,
} from '../stage1-outcome/schema';

vi.mock('server-only', () => ({}));

// Stub the validation helpers so we don't pull in next-auth /
// next/server during the test run. Only HttpError is consumed by the
// store; the rest are unused but exported to satisfy the import.
vi.mock('@/lib/validation/server-helpers', () => {
  class HttpError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = 'HttpError';
    }
  }
  return { HttpError };
});

// Vitest hoists vi.mock() to the top of the file, so any variables it
// references must also be hoisted. vi.hoisted() is the canonical way
// to share mock fns between the factory and the test body.
type WhereArg = { where?: Record<string, unknown>; data?: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn<(arg: WhereArg) => Promise<{ count: number }>>(),
  createMany: vi.fn<(arg: unknown) => Promise<{ count: number }>>(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    ideationStageRun: {
      updateMany: mocks.updateMany,
      createMany: mocks.createMany,
      findMany:  vi.fn(),
      findFirst: vi.fn(),
    },
  },
  toJsonValue: (x: unknown) => x,
}));

// Re-import after the mock so the store sees our stub. The folder
// barrel re-exports both the shared helper (from index) and the
// Stage 1 transitions (from stage1-transitions).
import {
  createInitialStageRunsForNoIdea,
  markStage1Committed,
  revertToEdit,
  restoreFromEditSnapshot,
} from '.';

const { updateMany, createMany } = mocks;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocument(): OutcomeDocument {
  return {
    dimensions: {
      timeHorizon:         { value: '6-18mo',      confidence: 0.8, extractedAt: null },
      financialGoal:       { value: { shape: 'full_replacement', target: 'X' }, confidence: 0.8, extractedAt: null },
      riskTolerance:       { value: 'moderate',    confidence: 0.8, extractedAt: null },
      lifestylePreference: { value: 'side_hustle', confidence: 0.8, extractedAt: null },
    },
    synthesisParagraph: 'A coherent picture.',
    rulesOut:           'Rules out venture scale.',
    recommendedActions: [],
  };
}

beforeEach(() => {
  updateMany.mockReset();
  createMany.mockReset();
});

// ---------------------------------------------------------------------------
// createInitialStageRunsForNoIdea — Stage 0 already committed at creation
// ---------------------------------------------------------------------------

describe('createInitialStageRunsForNoIdea', () => {
  it('creates one committed stage 0 row and one authoring stage 1 row', async () => {
    createMany.mockResolvedValue({ count: 2 });

    const tx = { ideationStageRun: { createMany } } as unknown as Parameters<typeof createInitialStageRunsForNoIdea>[0];
    await createInitialStageRunsForNoIdea(tx, 'sess_1');

    const arg = createMany.mock.calls[0][0] as { data: Array<{ stageNumber: number; status: string; committedAt: Date | null }> };
    expect(arg.data).toHaveLength(2);

    const stage0 = arg.data.find(r => r.stageNumber === 0);
    const stage1 = arg.data.find(r => r.stageNumber === 1);

    expect(stage0?.status).toBe('committed');
    expect(stage0?.committedAt).toBeInstanceOf(Date);

    expect(stage1?.status).toBe('authoring');
    expect(stage1?.committedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// markStage1Committed — only output_ready → committed
// ---------------------------------------------------------------------------

describe('markStage1Committed', () => {
  it('only matches rows currently in output_ready (idempotent against already-committed)', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await markStage1Committed('run_1');

    const arg = updateMany.mock.calls[0][0] as WhereArg;
    expect(arg.where).toMatchObject({ id: 'run_1', status: 'output_ready' });
    expect(arg.data).toMatchObject({ status: 'committed' });
    expect(arg.data?.committedAt).toBeInstanceOf(Date);
  });

  it('no-ops silently when the row is already committed (count=0)', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(markStage1Committed('run_1')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// revertToEdit — snapshot must preserve the prior status correctly
// ---------------------------------------------------------------------------

describe('revertToEdit', () => {
  it("captures priorStatus='committed' in the snapshot when reverting from committed", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await revertToEdit('run_1', 'user_1', 'timeHorizon', makeDocument(), 'committed');

    const arg = updateMany.mock.calls[0][0] as WhereArg;
    expect(arg.where).toMatchObject({
      id:      'run_1',
      session: { userId: 'user_1' },
    });
    expect((arg.where?.status as { in: string[] }).in).toEqual(['output_ready', 'committed']);
    expect(arg.data).toMatchObject({
      status:      'authoring',
      committedAt: null,
    });

    // The output payload is the new authoring state — confirm the
    // snapshot carries priorStatus='committed' and the prior document.
    const output = arg.data?.output as { priorCommittedSnapshot: PriorCommittedSnapshot };
    expect(output.priorCommittedSnapshot.priorStatus).toBe('committed');
    expect(output.priorCommittedSnapshot.document.synthesisParagraph).toBe('A coherent picture.');
  });

  it("captures priorStatus='output_ready' when reverting from output_ready", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await revertToEdit('run_1', 'user_1', 'financialGoal', makeDocument(), 'output_ready');

    const arg = updateMany.mock.calls[0][0] as WhereArg;
    const output = arg.data?.output as { priorCommittedSnapshot: PriorCommittedSnapshot };
    expect(output.priorCommittedSnapshot.priorStatus).toBe('output_ready');
  });

  it('throws HttpError(409) when the row is not in a finalised state', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      revertToEdit('run_1', 'user_1', 'timeHorizon', makeDocument(), 'committed'),
    ).rejects.toThrow(/finalised state/);
  });

  it('writes editTargetDimension into the new authoring state', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await revertToEdit('run_1', 'user_1', 'riskTolerance', makeDocument(), 'committed');

    const arg = updateMany.mock.calls[0][0] as WhereArg;
    const output = arg.data?.output as { editTargetDimension: string };
    expect(output.editTargetDimension).toBe('riskTolerance');
  });
});

// ---------------------------------------------------------------------------
// restoreFromEditSnapshot — committedAt is set IFF priorStatus = committed
// ---------------------------------------------------------------------------

describe('restoreFromEditSnapshot', () => {
  it("re-stamps committedAt when priorStatus is 'committed'", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await restoreFromEditSnapshot('run_1', 'user_1', {
      document:    makeDocument(),
      priorStatus: 'committed',
    });

    const arg = updateMany.mock.calls[0][0] as WhereArg;
    expect(arg.data).toMatchObject({
      status: 'committed',
    });
    expect(arg.data?.committedAt).toBeInstanceOf(Date);
  });

  it("keeps committedAt null when priorStatus is 'output_ready'", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await restoreFromEditSnapshot('run_1', 'user_1', {
      document:    makeDocument(),
      priorStatus: 'output_ready',
    });

    const arg = updateMany.mock.calls[0][0] as WhereArg;
    expect(arg.data).toMatchObject({
      status:      'output_ready',
      committedAt: null,
    });
  });

  it('scopes to authoring rows + session.userId so a stale snapshot from another session cannot trample state', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await restoreFromEditSnapshot('run_1', 'user_1', {
      document:    makeDocument(),
      priorStatus: 'committed',
    });
    const arg = updateMany.mock.calls[0][0] as WhereArg;
    expect(arg.where).toMatchObject({
      id:      'run_1',
      status:  'authoring',
      session: { userId: 'user_1' },
    });
  });

  it('throws HttpError(409) when the row is not in authoring state', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      restoreFromEditSnapshot('run_1', 'user_1', {
        document:    makeDocument(),
        priorStatus: 'committed',
      }),
    ).rejects.toThrow(/editing state/);
  });
});
