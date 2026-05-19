// src/lib/ideation/stage-run-store/cascade-stage4.test.ts
//
// Three-rule cascade tests scaled to three triggering stages
// (stage1 / stage2 / stage3). Same machinery the Stage 3 cascade
// tests pin (see cascade-stage3.test.ts); these focus on the
// behavioural differences that come from a third trigger:
//
//   - cascade fires from each of the three sources
//   - partial discharge keeps the snapshot when other triggers remain
//   - all-discharged restores
//   - any-source commit clears the entire snapshot

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
  cascadeStage1Or2Or3EditToStage4,
  restoreStage4FromCascadeSnapshot,
  clearStage4CascadeSnapshot,
} from './cross-stage-cascades';
import type {
  OpportunityEvaluationsDocument,
  Stage4AuthoringState,
} from '../stage4-opportunities/schema';

const { findFirst, updateMany } = mocks;

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeDocument(): OpportunityEvaluationsDocument {
  return {
    evaluations:         [],
    responsesSnapshot:   [],
    chosenOpportunityId: 'oe-1',
    chosenRationale:     'why this one',
    rejectedRationale:   'why not the others',
    recommendedActions:  [],
    researchLog:         [],
    composedAt:          '2026-05-15T00:00:00.000Z',
  };
}

function authoringWithSnapshot(triggers: Array<'stage1' | 'stage2' | 'stage3'>): Stage4AuthoringState {
  return {
    opportunities:             [],
    founderCommunityResponses: [],
    recommendedActions:        [],
    researchLog:               [],
    cascadeSnapshot: {
      document:         fakeDocument(),
      triggeringStages: triggers,
      snapshottedAt:    '2026-05-15T01:00:00.000Z',
    },
    requiresRederivation: true,
  };
}

// ---------------------------------------------------------------------------
// Single-source cascades
// ---------------------------------------------------------------------------

describe('cascadeStage1Or2Or3EditToStage4 — single-source trigger', () => {
  it.each(['stage1', 'stage2', 'stage3'] as const)(
    'snapshots from %s when Stage 4 is committed',
    async (src) => {
      findFirst.mockResolvedValue({ id: 's4', status: 'committed', output: fakeDocument() });
      updateMany.mockResolvedValue({ count: 1 });

      await cascadeStage1Or2Or3EditToStage4('sess', 'u', src);

      const arg = updateMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({ id: 's4', stageNumber: 4 });
      expect(arg.data).toMatchObject({ status: 'authoring', committedAt: null });
      const written = arg.data?.output as Stage4AuthoringState;
      expect(written.cascadeSnapshot?.triggeringStages).toEqual([src]);
      expect(written.requiresRederivation).toBe(true);
    },
  );

  it('no-ops when there is no Stage 4 row', async () => {
    findFirst.mockResolvedValue(null);
    await cascadeStage1Or2Or3EditToStage4('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Multi-source: appending an additional trigger
// ---------------------------------------------------------------------------

describe('cascadeStage1Or2Or3EditToStage4 — additional source append', () => {
  it('appends stage2 onto an existing stage1 trigger list', async () => {
    findFirst.mockResolvedValue({ id: 's4', status: 'authoring', output: authoringWithSnapshot(['stage1']) });
    updateMany.mockResolvedValue({ count: 1 });

    await cascadeStage1Or2Or3EditToStage4('sess', 'u', 'stage2');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage4AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage1', 'stage2']);
  });

  it('is a no-op when the same source is already in the trigger list', async () => {
    findFirst.mockResolvedValue({ id: 's4', status: 'authoring', output: authoringWithSnapshot(['stage1', 'stage2']) });
    await cascadeStage1Or2Or3EditToStage4('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('appends stage3 when stage1 + stage2 are already triggers (all-three case)', async () => {
    findFirst.mockResolvedValue({ id: 's4', status: 'authoring', output: authoringWithSnapshot(['stage1', 'stage2']) });
    updateMany.mockResolvedValue({ count: 1 });

    await cascadeStage1Or2Or3EditToStage4('sess', 'u', 'stage3');

    const written = updateMany.mock.calls[0][0].data?.output as Stage4AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage1', 'stage2', 'stage3']);
  });
});

// ---------------------------------------------------------------------------
// Restore — partial discharge vs full discharge
// ---------------------------------------------------------------------------

describe('restoreStage4FromCascadeSnapshot', () => {
  it('removes the discharging stage from the list when others remain (no restore)', async () => {
    findFirst.mockResolvedValue({ id: 's4', status: 'authoring', output: authoringWithSnapshot(['stage1', 'stage2', 'stage3']) });
    updateMany.mockResolvedValue({ count: 1 });

    await restoreStage4FromCascadeSnapshot('sess', 'u', 'stage2');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage4AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage1', 'stage3']);
    // Still authoring — other upstream stages have not yet discharged.
    expect(arg.data?.status).toBeUndefined();
  });

  it('restores the document when the last triggering stage discharges', async () => {
    findFirst.mockResolvedValue({ id: 's4', status: 'authoring', output: authoringWithSnapshot(['stage1']) });
    updateMany.mockResolvedValue({ count: 1 });

    await restoreStage4FromCascadeSnapshot('sess', 'u', 'stage1');

    const arg = updateMany.mock.calls[0][0];
    expect(arg.data?.status).toBe('output_ready');
    expect(arg.data?.committedAt).toBeNull();
    expect(arg.data?.output).toMatchObject({ chosenOpportunityId: 'oe-1' });
  });

  it('no-ops when the discharging stage is not in the trigger list', async () => {
    findFirst.mockResolvedValue({ id: 's4', status: 'authoring', output: authoringWithSnapshot(['stage1']) });
    await restoreStage4FromCascadeSnapshot('sess', 'u', 'stage3');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Clear — any-source commit nulls the entire snapshot
// ---------------------------------------------------------------------------

describe('clearStage4CascadeSnapshot', () => {
  it('nulls the entire snapshot and keeps requiresRederivation=true', async () => {
    findFirst.mockResolvedValue({ id: 's4', status: 'authoring', output: authoringWithSnapshot(['stage1', 'stage3']) });
    updateMany.mockResolvedValue({ count: 1 });

    await clearStage4CascadeSnapshot('sess', 'u', 'stage1');

    const written = updateMany.mock.calls[0][0].data?.output as Stage4AuthoringState;
    expect(written.cascadeSnapshot).toBeNull();
    expect(written.requiresRederivation).toBe(true);
  });

  it('no-ops when the snapshot was already cleared', async () => {
    findFirst.mockResolvedValue({
      id: 's4',
      status: 'authoring',
      output: { ...authoringWithSnapshot(['stage1']), cascadeSnapshot: null },
    });
    await clearStage4CascadeSnapshot('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});
