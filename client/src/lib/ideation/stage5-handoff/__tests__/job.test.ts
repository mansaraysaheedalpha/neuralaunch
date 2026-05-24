// src/lib/ideation/stage5-handoff/__tests__/job.test.ts
//
// Tests for the IdeationStage5Job CRUD helpers. Focus areas:
//   - findOpenStage5Job filters by non-terminal stages only
//   - succeedStage5Job records the recommendationId + clears errorMessage
//   - failStage5Job sanitises the message (first line, capped at 500)
//   - stage updates are best-effort (do not throw on Prisma failure)

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// vi.mock is hoisted to the top of the file — local `const` references
// inside the factory are NOT yet initialised at that point. Use
// vi.hoisted so the mock-state variables get the same hoisting
// treatment as the vi.mock calls themselves.
const { findFirst, create, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create:    vi.fn(),
  update:    vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    ideationStage5Job: { findFirst, create, update },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {},
            child: () => ({ warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }) },
}));

import {
  STAGE5_JOB_STAGES,
  STAGE5_TERMINAL_STAGES,
  createStage5Job,
  findOpenStage5Job,
  updateStage5JobStage,
  succeedStage5Job,
  failStage5Job,
} from '../job';

beforeEach(() => {
  findFirst.mockReset();
  create.mockReset();
  update.mockReset();
});

describe('STAGE5_JOB_STAGES + terminal stages', () => {
  it('includes the canonical 6-state pipeline', () => {
    expect(STAGE5_JOB_STAGES).toEqual([
      'queued', 'loading_inputs', 'synthesizing', 'persisting', 'succeeded', 'failed',
    ]);
  });

  it('marks succeeded + failed as terminal', () => {
    expect(STAGE5_TERMINAL_STAGES).toContain('succeeded');
    expect(STAGE5_TERMINAL_STAGES).toContain('failed');
    expect(STAGE5_TERMINAL_STAGES).not.toContain('queued');
    expect(STAGE5_TERMINAL_STAGES).not.toContain('synthesizing');
  });
});

describe('createStage5Job', () => {
  it('creates the row with default stage=queued', async () => {
    create.mockResolvedValueOnce({ id: 'job_1' });
    const result = await createStage5Job({ userId: 'u', sessionId: 's' });

    expect(result).toEqual({ id: 'job_1' });
    expect(create).toHaveBeenCalledWith({
      data:   { userId: 'u', sessionId: 's', stage: 'queued' },
      select: { id: true },
    });
  });
});

describe('findOpenStage5Job', () => {
  it('returns the job when an in-flight one exists', async () => {
    findFirst.mockResolvedValueOnce({ id: 'job_open' });
    const result = await findOpenStage5Job('sess_1');
    expect(result).toEqual({ id: 'job_open' });
  });

  it('returns null when no job is in flight', async () => {
    findFirst.mockResolvedValueOnce(null);
    expect(await findOpenStage5Job('sess_1')).toBeNull();
  });

  it('filters by stage NOT IN terminal stages', async () => {
    findFirst.mockResolvedValueOnce(null);
    await findOpenStage5Job('sess_1');
    const callArgs = findFirst.mock.calls[0][0] as { where: { stage: { notIn: string[] } } };
    expect(callArgs.where.stage.notIn).toEqual(['succeeded', 'failed']);
  });
});

describe('updateStage5JobStage', () => {
  it('writes the new stage', async () => {
    update.mockResolvedValueOnce({ id: 'job_1' });
    await updateStage5JobStage('job_1', 'synthesizing');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'job_1' }, data: { stage: 'synthesizing' }, select: { id: true },
    });
  });

  it('is best-effort — does NOT throw if Prisma fails', async () => {
    update.mockRejectedValueOnce(new Error('row deleted'));
    await expect(updateStage5JobStage('job_1', 'synthesizing')).resolves.toBeUndefined();
  });
});

describe('succeedStage5Job', () => {
  it('records recommendationId + clears errorMessage', async () => {
    update.mockResolvedValueOnce({ id: 'job_1' });
    await succeedStage5Job('job_1', 'rec_42');
    const call = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.stage).toBe('succeeded');
    expect(call.data.recommendationId).toBe('rec_42');
    expect(call.data.errorMessage).toBeNull();
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });
});

describe('failStage5Job', () => {
  it('writes only the first line of the error message', async () => {
    update.mockResolvedValueOnce({ id: 'job_1' });
    await failStage5Job('job_1', new Error('first line\nsecond line\nstack trace'));
    const call = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.errorMessage).toBe('first line');
  });

  it('caps the error message at 500 chars', async () => {
    update.mockResolvedValueOnce({ id: 'job_1' });
    const longMessage = 'a'.repeat(600);
    await failStage5Job('job_1', new Error(longMessage));
    const call = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((call.data.errorMessage as string).length).toBe(500);
  });

  it('falls back to "Unknown error" on empty Error', async () => {
    update.mockResolvedValueOnce({ id: 'job_1' });
    await failStage5Job('job_1', new Error(''));
    const call = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.errorMessage).toBe('Unknown error');
  });
});
