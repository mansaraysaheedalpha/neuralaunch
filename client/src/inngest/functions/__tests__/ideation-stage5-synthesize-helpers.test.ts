// src/inngest/functions/__tests__/ideation-stage5-synthesize-helpers.test.ts
//
// Tests for the Stage 5 worker helpers:
//   - loadStage5SynthesisInputs: throws on missing/malformed upstream
//     docs; falls back to deriving the chosen snapshot from Stage 4
//     when the Stage 5 authoring state hasn't seeded yet; rebuilds
//     reserves from Stage 4 when the snapshot is empty.
//   - upsertStage5Recommendation: keyed on (sessionId, parentRecId IS
//     NULL) — second call with the same sessionId updates the existing
//     row (idempotency), not duplicates.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// ── Prisma mock — vi.hoisted lifts the vi.fn() instances alongside
// the auto-hoisted vi.mock factories.
const {
  stageRunFindMany, stageRunFindFirst,
  recFindFirst, recUpdate, recCreate,
} = vi.hoisted(() => ({
  stageRunFindMany:  vi.fn(),
  stageRunFindFirst: vi.fn(),
  recFindFirst:      vi.fn(),
  recUpdate:         vi.fn(),
  recCreate:         vi.fn(),
}));

type TxClient = {
  recommendation: {
    findFirst: typeof recFindFirst;
    update:    typeof recUpdate;
    create:    typeof recCreate;
  };
};

vi.mock('@/lib/prisma', () => ({
  default: {
    ideationStageRun: { findMany: stageRunFindMany, findFirst: stageRunFindFirst },
    recommendation:   { findFirst: recFindFirst, update: recUpdate, create: recCreate },
    $transaction:     <T>(fn: (tx: TxClient) => Promise<T>): Promise<T> => fn({
      recommendation: { findFirst: recFindFirst, update: recUpdate, create: recCreate },
    }),
  },
  toJsonValue: <T>(v: T) => v,
}));

// Lifecycle context loader — returns no profile/cycles so the
// renderLifecycleBlock helper produces an empty string.
vi.mock('@/lib/lifecycle', () => ({
  loadInterviewContext: vi.fn(() => Promise.resolve({
    profile: null, cycleSummaries: [], crossVentureSummaries: [], forkContext: null,
  })),
}));
vi.mock('@/lib/lifecycle/prompt-renderers', () => ({
  renderFounderProfileBlock: () => '',
  renderCycleSummariesBlock: () => '',
  renderCrossVentureBlock:   () => '',
}));

// getSession returns null so ventureId is unresolved (matches the
// first-ever-interview pre-lifecycle path).
vi.mock('@/lib/discovery/session-store', () => ({
  getSession: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/phase-context', () => ({
  PHASES: { RECOMMENDATION: 1 },
  buildPhaseContext: (n: number, u: Record<string, unknown>) => ({ phaseNumber: n, upstream: u }),
}));

// The four ideation safeParse helpers — happy path returns identity
// on the recognised shape, null on garbage.
vi.mock('@/lib/ideation', () => ({
  safeParseOutcomeDocument:                (v: unknown) => (v && typeof v === 'object' && (v as Record<string, unknown>).__kind === 'outcome') ? v : null,
  safeParseRequirementsDocument:           (v: unknown) => (v && typeof v === 'object' && (v as Record<string, unknown>).__kind === 'requirements') ? v : null,
  safeParsePainInventoryDocument:          (v: unknown) => (v && typeof v === 'object' && (v as Record<string, unknown>).__kind === 'pain') ? v : null,
  safeParseOpportunityEvaluationsDocument: (v: unknown) => (v && typeof v === 'object' && (v as Record<string, unknown>).__kind === 'opps') ? v : null,
  safeParseStage5AuthoringState:           (v: unknown) => (v && typeof v === 'object' && (v as Record<string, unknown>).__kind === 'stage5auth') ? v : { chosenOpportunity: null, reserveOpportunities: [], synthesizedRecommendationId: null, synthesisStatus: 'awaiting_synthesis', synthesisError: null, recommendedActions: [], cascadeSnapshot: null, requiresRederivation: false },
  buildReserveOpportunities:               vi.fn(() => [{ id: 'reserve_1', rank: 1 }]),
}));

import {
  loadStage5SynthesisInputs,
  upsertStage5Recommendation,
} from '../ideation-stage5-synthesize-helpers';

beforeEach(() => {
  stageRunFindMany.mockReset();
  stageRunFindFirst.mockReset();
  recFindFirst.mockReset();
  recUpdate.mockReset();
  recCreate.mockReset();
});

// ---------------------------------------------------------------------------
// loadStage5SynthesisInputs
// ---------------------------------------------------------------------------

describe('loadStage5SynthesisInputs', () => {
  function happyUpstream() {
    return [
      { stageNumber: 1, output: { __kind: 'outcome' } },
      { stageNumber: 2, output: { __kind: 'requirements' } },
      { stageNumber: 3, output: { __kind: 'pain' } },
      { stageNumber: 4, output: { __kind: 'opps', chosenOpportunityId: 'opp_1', evaluations: [
        { id: 'opp_1', painPointSummary: 'p', agentVerdict: 'pursue', founderVerdict: 'pursue', agentReasoning: 'r', layerAResearch: null, layerBExtractedSignal: null },
      ] } },
    ];
  }

  it('throws when Stage 1 is missing', async () => {
    stageRunFindMany.mockResolvedValueOnce([
      { stageNumber: 2, output: { __kind: 'requirements' } },
      { stageNumber: 3, output: { __kind: 'pain' } },
      { stageNumber: 4, output: { __kind: 'opps' } },
    ]);
    await expect(loadStage5SynthesisInputs({ sessionId: 's', userId: 'u', stageRunId: 'sr' }))
      .rejects.toThrow(/Stage 1/);
  });

  it('throws when Stage 4 is malformed', async () => {
    stageRunFindMany.mockResolvedValueOnce([
      { stageNumber: 1, output: { __kind: 'outcome' } },
      { stageNumber: 2, output: { __kind: 'requirements' } },
      { stageNumber: 3, output: { __kind: 'pain' } },
      { stageNumber: 4, output: { garbage: true } },
    ]);
    await expect(loadStage5SynthesisInputs({ sessionId: 's', userId: 'u', stageRunId: 'sr' }))
      .rejects.toThrow(/Stage 4/);
  });

  it('throws when the Stage 5 row is missing', async () => {
    stageRunFindMany.mockResolvedValueOnce(happyUpstream());
    stageRunFindFirst.mockResolvedValueOnce(null);
    await expect(loadStage5SynthesisInputs({ sessionId: 's', userId: 'u', stageRunId: 'sr' }))
      .rejects.toThrow(/Stage 5 row missing/);
  });

  it('derives the chosen snapshot from Stage 4 when the Stage 5 authoring state is empty', async () => {
    stageRunFindMany.mockResolvedValueOnce(happyUpstream());
    stageRunFindFirst.mockResolvedValueOnce({ output: null });
    const result = await loadStage5SynthesisInputs({ sessionId: 's', userId: 'u', stageRunId: 'sr' });
    expect(result.chosen.id).toBe('opp_1');
    expect(result.reserves).toEqual([{ id: 'reserve_1', rank: 1 }]);
    expect(result.lifecycleBlock).toBe(''); // no ventureId → empty
  });
});

// ---------------------------------------------------------------------------
// upsertStage5Recommendation — idempotency
// ---------------------------------------------------------------------------

describe('upsertStage5Recommendation', () => {
  const baseRec = {
    recommendationType:     'sales_motion',
    summary:                'summary',
    path:                   'path',
    reasoning:              'reasoning',
    firstThreeSteps:        ['a', 'b'],
    timeToFirstResult:      '2w',
    risks:                  [{ risk: 'x', mitigation: 'y' }],
    assumptions:            ['p'],
    whatWouldMakeThisWrong: 'q',
    alternativeRejected:    [{ alternative: 'm', whyNotForThem: 'n' }],
  } as unknown as Parameters<typeof upsertStage5Recommendation>[0]['recommendation'];

  it('CREATES a Recommendation row on first call (no existing primary)', async () => {
    recFindFirst.mockResolvedValueOnce(null);
    recCreate.mockResolvedValueOnce({ id: 'rec_new' });

    const id = await upsertStage5Recommendation({
      userId: 'u', sessionId: 's',
      recommendation: baseRec,
      researchLog: [], reserves: [],
    });

    expect(id).toBe('rec_new');
    expect(recCreate).toHaveBeenCalledTimes(1);
    expect(recUpdate).not.toHaveBeenCalled();
  });

  it('UPDATES the existing Recommendation row on second call (idempotent retry)', async () => {
    recFindFirst.mockResolvedValueOnce({ id: 'rec_existing' });

    const id = await upsertStage5Recommendation({
      userId: 'u', sessionId: 's',
      recommendation: baseRec,
      researchLog: [], reserves: [],
    });

    expect(id).toBe('rec_existing');
    expect(recUpdate).toHaveBeenCalledTimes(1);
    expect(recCreate).not.toHaveBeenCalled();
  });

  it('mirrors the reserve list onto ideationReserveOpportunities (continuation brief contract)', async () => {
    recFindFirst.mockResolvedValueOnce(null);
    recCreate.mockResolvedValueOnce({ id: 'rec_new' });
    const reserves = [{ id: 'r1', rank: 1 }, { id: 'r2', rank: 2 }] as unknown as Parameters<typeof upsertStage5Recommendation>[0]['reserves'];

    await upsertStage5Recommendation({
      userId: 'u', sessionId: 's',
      recommendation: baseRec,
      researchLog: [], reserves,
    });

    const created = recCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(created.data.ideationReserveOpportunities).toEqual(reserves);
  });
});
