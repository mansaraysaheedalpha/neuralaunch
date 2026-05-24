// src/lib/ideation/stage-run-store/cascade-stage5.test.ts
//
// Three-rule cascade tests scaled to four triggering stages
// (stage1 / stage2 / stage3 / stage4). Mirrors cascade-stage4.test.ts;
// the Stage 5 specifics that warrant explicit coverage:
//
//   - Branch A reverts 'output_ready' → 'authoring' (Stage 5 has no
//     'committed' status, so output_ready is the only finalised state
//     the cascade can revert)
//   - On restore-from-snapshot, status flips back to 'output_ready'
//     (not 'committed' as Stage 4 does — Stage 5 never enters 'committed')
//   - Cascade preserves synthesizedRecommendationId on the new authoring
//     state so the founder can re-fire /stage5/synthesize and re-upsert
//     the Recommendation row in place

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
  cascadeStage1Or2Or3Or4EditToStage5,
  restoreStage5FromCascadeSnapshot,
  clearStage5CascadeSnapshot,
} from './cross-stage-cascades';
import type {
  Stage5AuthoringState,
  Stage5HandoffDocument,
  ChosenOpportunitySnapshot,
} from '../stage5-handoff/schema';

const { findFirst, updateMany } = mocks;

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeChosen(): ChosenOpportunitySnapshot {
  return {
    id:               'opp-1',
    painPointSummary: 'chosen pain',
    agentVerdict:     'pursue',
    founderVerdict:   'pursue',
    agentReasoning:   'agent rationale',
    layerASummary:    null,
    layerBSummary:    null,
  };
}

function fakeDocument(): Stage5HandoffDocument {
  return {
    chosenOpportunity:           fakeChosen(),
    reserveOpportunities:        [],
    synthesizedRecommendationId: 'rec-1',
    recommendedActions:          [],
    composedAt:                  '2026-05-15T00:00:00.000Z',
  };
}

function authoringWithSnapshot(
  triggers: Array<'stage1' | 'stage2' | 'stage3' | 'stage4'>,
): Stage5AuthoringState {
  return {
    chosenOpportunity:           fakeChosen(),
    reserveOpportunities:        [],
    synthesizedRecommendationId: 'rec-1',
    synthesisStatus:             'awaiting_synthesis',
    synthesisError:              null,
    recommendedActions:          [],
    cascadeSnapshot: {
      document:         fakeDocument(),
      triggeringStages: triggers,
      snapshottedAt:    '2026-05-15T01:00:00.000Z',
    },
    requiresRederivation: true,
  };
}

function normalAuthoring(): Stage5AuthoringState {
  return {
    chosenOpportunity:           null,
    reserveOpportunities:        [],
    synthesizedRecommendationId: null,
    synthesisStatus:             'awaiting_synthesis',
    synthesisError:              null,
    recommendedActions:          [],
    cascadeSnapshot:             null,
    requiresRederivation:        false,
  };
}

// ---------------------------------------------------------------------------
// Single-source cascades — Branch A (output_ready → authoring)
// ---------------------------------------------------------------------------

describe('cascadeStage1Or2Or3Or4EditToStage5 — single-source trigger', () => {
  it.each(['stage1', 'stage2', 'stage3', 'stage4'] as const)(
    'snapshots from %s when Stage 5 is output_ready',
    async (src) => {
      findFirst.mockResolvedValue({ id: 's5', status: 'output_ready', output: fakeDocument() });
      updateMany.mockResolvedValue({ count: 1 });

      await cascadeStage1Or2Or3Or4EditToStage5('sess', 'u', src);

      const arg = updateMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({ id: 's5', stageNumber: 5, status: 'output_ready' });
      expect(arg.data).toMatchObject({ status: 'authoring' });
      const written = arg.data?.output as Stage5AuthoringState;
      expect(written.cascadeSnapshot?.triggeringStages).toEqual([src]);
      expect(written.requiresRederivation).toBe(true);
      // synthesizedRecommendationId is preserved so the canvas can
      // surface "previously synthesized" context and re-fire upsert.
      expect(written.synthesizedRecommendationId).toBe('rec-1');
      // synthesisStatus is reset so the founder must re-synthesise.
      expect(written.synthesisStatus).toBe('awaiting_synthesis');
    },
  );

  it('no-ops when there is no Stage 5 row', async () => {
    findFirst.mockResolvedValue(null);
    await cascadeStage1Or2Or3Or4EditToStage5('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('drops the cascade silently when the output document fails to parse', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'output_ready', output: { malformed: true } });
    await cascadeStage1Or2Or3Or4EditToStage5('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Multi-source: appending an additional trigger (Branch B)
// ---------------------------------------------------------------------------

describe('cascadeStage1Or2Or3Or4EditToStage5 — additional source append', () => {
  it('appends stage2 onto an existing stage1 trigger list', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: authoringWithSnapshot(['stage1']) });
    updateMany.mockResolvedValue({ count: 1 });

    await cascadeStage1Or2Or3Or4EditToStage5('sess', 'u', 'stage2');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage5AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage1', 'stage2']);
  });

  it('is a no-op when the same source is already in the trigger list', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: authoringWithSnapshot(['stage1', 'stage2']) });
    await cascadeStage1Or2Or3Or4EditToStage5('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('appends stage4 when stage1 + stage2 + stage3 are already triggers (all-four case)', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: authoringWithSnapshot(['stage1', 'stage2', 'stage3']) });
    updateMany.mockResolvedValue({ count: 1 });

    await cascadeStage1Or2Or3Or4EditToStage5('sess', 'u', 'stage4');

    const written = updateMany.mock.calls[0][0].data?.output as Stage5AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage1', 'stage2', 'stage3', 'stage4']);
  });
});

// ---------------------------------------------------------------------------
// Branch C — normal authoring without snapshot still flips
// requiresRederivation. Same audit-fix as Stage 3/4.
// ---------------------------------------------------------------------------

describe('cascadeStage1Or2Or3Or4EditToStage5 — normal authoring (no snapshot)', () => {
  it('flips requiresRederivation=true when Stage 5 is in normal authoring', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: normalAuthoring() });
    updateMany.mockResolvedValue({ count: 1 });

    await cascadeStage1Or2Or3Or4EditToStage5('sess', 'u', 'stage1');

    const written = updateMany.mock.calls[0][0].data?.output as Stage5AuthoringState;
    expect(written.requiresRederivation).toBe(true);
    expect(written.cascadeSnapshot).toBeNull();
  });

  it('is a no-op when requiresRederivation is already true', async () => {
    findFirst.mockResolvedValue({
      id: 's5',
      status: 'authoring',
      output: { ...normalAuthoring(), requiresRederivation: true },
    });
    await cascadeStage1Or2Or3Or4EditToStage5('sess', 'u', 'stage2');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Restore — partial discharge vs full discharge
// ---------------------------------------------------------------------------

describe('restoreStage5FromCascadeSnapshot', () => {
  it('removes the discharging stage from the list when others remain (no restore)', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: authoringWithSnapshot(['stage1', 'stage2', 'stage4']) });
    updateMany.mockResolvedValue({ count: 1 });

    await restoreStage5FromCascadeSnapshot('sess', 'u', 'stage2');

    const arg = updateMany.mock.calls[0][0];
    const written = arg.data?.output as Stage5AuthoringState;
    expect(written.cascadeSnapshot?.triggeringStages).toEqual(['stage1', 'stage4']);
    // Still authoring — other upstream stages have not yet discharged.
    expect(arg.data?.status).toBeUndefined();
  });

  it('restores the document and flips to output_ready when the last triggering stage discharges', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: authoringWithSnapshot(['stage1']) });
    updateMany.mockResolvedValue({ count: 1 });

    await restoreStage5FromCascadeSnapshot('sess', 'u', 'stage1');

    const arg = updateMany.mock.calls[0][0];
    expect(arg.data?.status).toBe('output_ready');
    // Stage 5 never has 'committed' — the document is restored directly.
    expect(arg.data?.output).toMatchObject({ synthesizedRecommendationId: 'rec-1' });
  });

  it('no-ops when the discharging stage is not in the trigger list', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: authoringWithSnapshot(['stage1']) });
    await restoreStage5FromCascadeSnapshot('sess', 'u', 'stage4');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('no-ops when there is no Stage 5 row', async () => {
    findFirst.mockResolvedValue(null);
    await restoreStage5FromCascadeSnapshot('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Clear — any-source commit nulls the entire snapshot
// ---------------------------------------------------------------------------

describe('clearStage5CascadeSnapshot', () => {
  it('nulls the entire snapshot and keeps requiresRederivation=true', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: authoringWithSnapshot(['stage1', 'stage3']) });
    updateMany.mockResolvedValue({ count: 1 });

    await clearStage5CascadeSnapshot('sess', 'u', 'stage1');

    const written = updateMany.mock.calls[0][0].data?.output as Stage5AuthoringState;
    expect(written.cascadeSnapshot).toBeNull();
    expect(written.requiresRederivation).toBe(true);
  });

  it('no-ops when the snapshot was already cleared', async () => {
    findFirst.mockResolvedValue({
      id: 's5',
      status: 'authoring',
      output: { ...authoringWithSnapshot(['stage1']), cascadeSnapshot: null },
    });
    await clearStage5CascadeSnapshot('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('no-ops when the clearing stage is not in the trigger list', async () => {
    findFirst.mockResolvedValue({ id: 's5', status: 'authoring', output: authoringWithSnapshot(['stage2']) });
    await clearStage5CascadeSnapshot('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('no-ops when there is no Stage 5 row', async () => {
    findFirst.mockResolvedValue(null);
    await clearStage5CascadeSnapshot('sess', 'u', 'stage1');
    expect(updateMany).not.toHaveBeenCalled();
  });
});
