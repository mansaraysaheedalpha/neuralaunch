// src/lib/lifecycle/context-loaders.test.ts
//
// Coverage for the cross-venture memory loader. Per CLAUDE.md priorities,
// the tests target hard data invariants (ownership, current-venture
// exclusion, status filter, archived-venture exclusion) and the security
// boundary (tier gate) — not happy-path mechanics.
//
// We mock prisma + getUserTier rather than spinning up a real database;
// the loader's behaviour is purely a function of those two collaborators.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CycleSummary } from './schemas';

// -----------------------------------------------------------------------
// Module mocks
// -----------------------------------------------------------------------

// `server-only` is a runtime guard that throws under non-server bundles.
// Vitest runs in node, but the import side-effect is what matters — stub
// it so the loader file can be imported in the test runner.
vi.mock('server-only', () => ({}));

// Mock the prisma client. We only need Cycle.findMany for these tests.
// The arg shape is typed so test assertions don't trigger the project's
// no-unsafe-* rules on `mock.calls[N][0]`.
interface CycleFindManyArg {
  where: {
    status: string;
    venture: {
      userId:     string;
      archivedAt: null;
      status:     { in: string[] };
      id?:        { not: string };
    };
  };
  orderBy: Array<Record<string, 'asc' | 'desc'>>;
  take:    number;
  select:  unknown;
}
const cycleFindMany = vi.fn<(arg: CycleFindManyArg) => Promise<unknown[]>>();
vi.mock('@/lib/prisma', () => ({
  default:     { cycle: { findMany: cycleFindMany } },
  toJsonValue: (x: unknown) => x,
}));

// Mock getUserTier — the tier gate is the security boundary the loader
// owns, so we drive it directly per test.
const getUserTier = vi.fn<(userId: string) => Promise<'free' | 'execute' | 'compound'>>();
vi.mock('./tier-limits', () => ({ getUserTier }));

// -----------------------------------------------------------------------
// Helper — minimum viable CycleSummary that passes safeParseCycleSummary.
// -----------------------------------------------------------------------

function makeSummary(overrides: Partial<CycleSummary> = {}): CycleSummary {
  return {
    cycleNumber: 1,
    duration:    { startDate: '2026-01-01', endDate: '2026-02-01', totalDays: 31 },
    recommendationType:    'build_software',
    recommendationSummary: 'Test recommendation summary.',
    keyAssumptions:        ['Assumption A'],
    execution: {
      tasksCompleted: 5, tasksBlocked: 0, tasksSkipped: 0,
      totalTasks: 5, completionPercentage: 100,
      highlightedCompletions: [], commonBlockReasons: [],
    },
    toolUsage: {
      coachSessions: 0, coachHighlights: [],
      composerSessions: 0, messagesSent: 0, messagesGenerated: 0,
      researchSessions: 0, researchKeyFindings: [],
      packagerSessions: 0, pricingDefined: false,
    },
    checkInPatterns: { frequency: 'weekly', recurringThemes: [], progressTrend: 'steady' },
    continuationConclusion:   'continue',
    validatedAssumptions:     [],
    invalidatedAssumptions:   [],
    keyLearnings:             [],
    calibrationAdjustments: {
      newAvoidancePatterns: [], newStrengths: [], toolPreferenceShifts: [],
    },
    ...overrides,
  };
}

function row(opts: {
  ventureId:   string;
  ventureName: string;
  cycleNumber: number;
  completedAt: Date | null;
  summary?:    CycleSummary;
}) {
  return {
    ventureId:   opts.ventureId,
    completedAt: opts.completedAt,
    summary:     opts.summary ?? makeSummary({ cycleNumber: opts.cycleNumber }),
    venture:     { name: opts.ventureName },
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('loadCrossVentureSummaries — tier gate', () => {
  beforeEach(() => {
    cycleFindMany.mockReset();
    getUserTier.mockReset();
  });

  it('returns [] for free tier without touching the database', async () => {
    getUserTier.mockResolvedValue('free');
    const { loadCrossVentureSummaries } = await import('./context-loaders');

    const result = await loadCrossVentureSummaries('user-1', 'venture-current');

    expect(result).toEqual([]);
    expect(cycleFindMany).not.toHaveBeenCalled();
  });

  it('returns [] for execute tier without touching the database', async () => {
    getUserTier.mockResolvedValue('execute');
    const { loadCrossVentureSummaries } = await import('./context-loaders');

    const result = await loadCrossVentureSummaries('user-1', 'venture-current');

    expect(result).toEqual([]);
    expect(cycleFindMany).not.toHaveBeenCalled();
  });

  it('queries cycles for compound tier', async () => {
    getUserTier.mockResolvedValue('compound');
    cycleFindMany.mockResolvedValue([
      row({
        ventureId:   'venture-other',
        ventureName: 'Other venture',
        cycleNumber: 1,
        completedAt: new Date('2026-03-15T00:00:00Z'),
      }),
    ]);
    const { loadCrossVentureSummaries } = await import('./context-loaders');

    const result = await loadCrossVentureSummaries('user-1', 'venture-current');

    expect(result.length).toBe(1);
    expect(result[0].ventureName).toBe('Other venture');
    expect(cycleFindMany).toHaveBeenCalledTimes(1);
  });
});

describe('loadCrossVentureSummaries — query filter shape (security boundary)', () => {
  beforeEach(() => {
    cycleFindMany.mockReset();
    getUserTier.mockReset();
    getUserTier.mockResolvedValue('compound');
    cycleFindMany.mockResolvedValue([]);
  });

  it('scopes the relational filter to the calling userId, excludes the current venture, excludes archived ventures, and filters by completed status', async () => {
    const { loadCrossVentureSummaries } = await import('./context-loaders');

    await loadCrossVentureSummaries('user-1', 'venture-current');

    expect(cycleFindMany).toHaveBeenCalledTimes(1);
    const arg = cycleFindMany.mock.calls[0][0];

    // Cycle-level: only completed cycles count as memory.
    expect(arg.where.status).toBe('completed');

    // Venture relation: the security-critical clauses.
    expect(arg.where.venture.userId).toBe('user-1');
    expect(arg.where.venture.archivedAt).toBeNull();
    expect(arg.where.venture.status).toEqual({ in: ['active', 'paused', 'completed'] });
    expect(arg.where.venture.id).toEqual({ not: 'venture-current' });
  });

  it('omits the current-venture exclusion clause when no currentVentureId is supplied', async () => {
    const { loadCrossVentureSummaries } = await import('./context-loaders');

    await loadCrossVentureSummaries('user-1', null);

    const arg = cycleFindMany.mock.calls[0][0];
    expect(arg.where.venture.userId).toBe('user-1');
    // No `id` clause — the caller has no current venture to exclude.
    expect(arg.where.venture.id).toBeUndefined();
  });
});

describe('loadCrossVentureSummaries — bound + ordering', () => {
  beforeEach(() => {
    cycleFindMany.mockReset();
    getUserTier.mockReset();
    getUserTier.mockResolvedValue('compound');
  });

  it('asks Prisma for at most CROSS_VENTURE_CYCLE_LIMIT rows ordered by completedAt DESC then cycleNumber DESC', async () => {
    cycleFindMany.mockResolvedValue([]);
    const { loadCrossVentureSummaries, CROSS_VENTURE_CYCLE_LIMIT } = await import('./context-loaders');

    await loadCrossVentureSummaries('user-1', 'venture-current');

    const arg = cycleFindMany.mock.calls[0][0];
    expect(arg.take).toBe(CROSS_VENTURE_CYCLE_LIMIT);
    expect(CROSS_VENTURE_CYCLE_LIMIT).toBe(6);
    expect(arg.orderBy).toEqual([
      { completedAt: 'desc' },
      { cycleNumber: 'desc' },
    ]);
  });

  it('preserves the database ordering in the returned array (no in-memory re-sort)', async () => {
    cycleFindMany.mockResolvedValue([
      row({ ventureId: 'v-a', ventureName: 'Alpha',  cycleNumber: 2, completedAt: new Date('2026-04-01T00:00:00Z') }),
      row({ ventureId: 'v-b', ventureName: 'Bravo',  cycleNumber: 1, completedAt: new Date('2026-03-15T00:00:00Z') }),
      row({ ventureId: 'v-a', ventureName: 'Alpha',  cycleNumber: 1, completedAt: new Date('2026-02-01T00:00:00Z') }),
    ]);
    const { loadCrossVentureSummaries } = await import('./context-loaders');

    const result = await loadCrossVentureSummaries('user-1', 'venture-current');

    expect(result.map(r => `${r.ventureName}#${r.summary.cycleNumber}`)).toEqual([
      'Alpha#2',
      'Bravo#1',
      'Alpha#1',
    ]);
  });

  it('drops rows with null or unparseable summary JSON without short-circuiting the rest', async () => {
    cycleFindMany.mockResolvedValue([
      row({ ventureId: 'v-a', ventureName: 'Alpha', cycleNumber: 2, completedAt: new Date('2026-04-01T00:00:00Z') }),
      // Cycle row that has not yet had a summary written (eg cycle just completed but summary engine still queued).
      { ventureId: 'v-b', completedAt: new Date('2026-03-15T00:00:00Z'), summary: null, venture: { name: 'Bravo' } },
      // Cycle row with corrupt JSON that fails Zod parse.
      { ventureId: 'v-c', completedAt: new Date('2026-02-01T00:00:00Z'), summary: { not: 'valid' }, venture: { name: 'Charlie' } },
      row({ ventureId: 'v-d', ventureName: 'Delta', cycleNumber: 1, completedAt: new Date('2026-01-01T00:00:00Z') }),
    ]);
    const { loadCrossVentureSummaries } = await import('./context-loaders');

    const result = await loadCrossVentureSummaries('user-1', 'venture-current');

    expect(result.map(r => r.ventureName)).toEqual(['Alpha', 'Delta']);
  });

  it('returns ventureName="Untitled venture" when the join inexplicably returns no name', async () => {
    cycleFindMany.mockResolvedValue([
      // venture relation present but name null — defensively cover the
      // edge so the renderer never gets `undefined` interpolated into a
      // user-facing prompt.
      { ventureId: 'v-x', completedAt: new Date('2026-03-15T00:00:00Z'), summary: makeSummary(), venture: null },
    ]);
    const { loadCrossVentureSummaries } = await import('./context-loaders');

    const result = await loadCrossVentureSummaries('user-1', 'venture-current');

    expect(result.length).toBe(1);
    expect(result[0].ventureName).toBe('Untitled venture');
  });
});
