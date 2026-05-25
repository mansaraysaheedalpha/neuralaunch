// Tests for loadNoIdeaContext — the gating + ownership-scoped loader
// for the legacy Recommendation review surface's No Idea augmentations.
//
// Invariant under test (security): augmentations MUST NOT render for
// non-no_idea recommendations. The brief's audit list explicitly calls
// this out: "Stage 5 augmentations on legacy Recommendation page MUST
// be gated on lifecycleScenario === 'no_idea' — leaking the cascade
// banner or reserves section to non-no_idea recommendations would be
// a regression."

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { prismaFindFirst } = vi.hoisted(() => ({
  prismaFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: { recommendation: { findFirst: prismaFindFirst } },
}));
vi.mock('@/lib/ideation', () => ({
  safeParseStage5AuthoringState: (output: unknown) => {
    if (output && typeof output === 'object' && 'reserveOpportunities' in output) {
      const o = output as { reserveOpportunities?: unknown[]; requiresRederivation?: boolean };
      return {
        chosenOpportunity:           null,
        reserveOpportunities:        Array.isArray(o.reserveOpportunities) ? o.reserveOpportunities : [],
        synthesizedRecommendationId: null,
        synthesisStatus:             'awaiting_synthesis',
        synthesisError:              null,
        recommendedActions:          [],
        cascadeSnapshot:             null,
        requiresRederivation:        Boolean(o.requiresRederivation),
      };
    }
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
  },
  safeParseStage5HandoffDocument: (output: unknown) => {
    if (output && typeof output === 'object' && 'reserveOpportunities' in output && 'synthesizedRecommendationId' in output) {
      const o = output as { reserveOpportunities?: unknown[] };
      return {
        chosenOpportunity:           null,
        reserveOpportunities:        Array.isArray(o.reserveOpportunities) ? o.reserveOpportunities : [],
        synthesizedRecommendationId: 'rec_x',
        recommendedActions:          [],
        composedAt:                  new Date().toISOString(),
      };
    }
    return null;
  },
}));

import { loadNoIdeaContext } from '../NoIdeaAugmentations';

beforeEach(() => {
  prismaFindFirst.mockReset();
});

describe('loadNoIdeaContext — isolation invariant', () => {
  it('returns isNoIdea=false when no IdeationStageRun rows exist on the session', async () => {
    prismaFindFirst.mockResolvedValueOnce({
      sessionId: 'sess_legacy',
      session: { ideationRuns: [] },
    });
    const ctx = await loadNoIdeaContext('rec_1', 'user_1');
    expect(ctx.isNoIdea).toBe(false);
    expect(ctx.reserves).toEqual([]);
    expect(ctx.requiresRederivation).toBe(false);
  });

  it('returns isNoIdea=false when the recommendation is not owned by the user', async () => {
    prismaFindFirst.mockResolvedValueOnce(null);
    const ctx = await loadNoIdeaContext('rec_other', 'user_1');
    expect(ctx.isNoIdea).toBe(false);
    expect(ctx.sessionId).toBeNull();
    // The Prisma call must filter by userId — we assert the where clause
    // shape so an accidental loosening shows up here.
    const args = prismaFindFirst.mock.calls[0][0] as { where: { id: string; userId: string } };
    expect(args.where).toMatchObject({ id: 'rec_other', userId: 'user_1' });
  });

  it('returns isNoIdea=true with reserves loaded from the Stage 5 handoff document', async () => {
    const reserve = {
      id: 'opp_1', painPointSummary: 'p1', agentVerdict: 'pursue',
      founderVerdict: 'pursue_with_caveats', agentReasoning: 'r',
      layerASummary: null, layerBSummary: null, rank: 1,
    };
    prismaFindFirst.mockResolvedValueOnce({
      sessionId: 'sess_ni',
      session: {
        ideationRuns: [
          { id: 'sr_4', stageNumber: 4, status: 'committed', output: {} },
          {
            id: 'sr_5', stageNumber: 5, status: 'output_ready',
            output: {
              reserveOpportunities:        [reserve],
              synthesizedRecommendationId: 'rec_1',
            },
          },
        ],
      },
    });
    const ctx = await loadNoIdeaContext('rec_1', 'user_1');
    expect(ctx.isNoIdea).toBe(true);
    expect(ctx.sessionId).toBe('sess_ni');
    expect(ctx.stage4StageRunId).toBe('sr_4');
    expect(ctx.reserves).toHaveLength(1);
    expect(ctx.reserves[0].id).toBe('opp_1');
  });

  it('surfaces requiresRederivation=true from the Stage 5 authoring slice', async () => {
    prismaFindFirst.mockResolvedValueOnce({
      sessionId: 'sess_ni',
      session: {
        ideationRuns: [
          { id: 'sr_4', stageNumber: 4, status: 'committed', output: {} },
          { id: 'sr_5', stageNumber: 5, status: 'authoring',
            output: { reserveOpportunities: [], requiresRederivation: true } },
        ],
      },
    });
    const ctx = await loadNoIdeaContext('rec_1', 'user_1');
    expect(ctx.isNoIdea).toBe(true);
    expect(ctx.requiresRederivation).toBe(true);
  });
});
