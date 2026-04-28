// src/lib/lifecycle/context-loaders.ts
//
// One function per agent type, per the loading matrix in §6.1 of the
// lifecycle memory spec. Each function returns the specific context
// slice that agent needs — no more, no less. The returned context is
// typed so agents can rely on the shape without parsing.
//
// Key design rules:
//   - Every query is ownership-scoped to the authenticated userId.
//   - If no Founder Profile exists yet (first-cycle founder), the
//     profile field is null. Calling code handles the null gracefully.
//   - CycleSummaries are returned newest-first so prompts that only
//     need the latest can take summaries[0] without sorting.

import 'server-only';
import prisma from '@/lib/prisma';
import { safeParseFounderProfile, safeParseCycleSummary, type FounderProfile, type CycleSummary } from './schemas';
import { getUserTier } from './tier-limits';

// Maximum number of completed cycles drawn from OTHER ventures to surface
// in the cross-venture context block. Compound caps at 3 ventures × ~2
// completed cycles per venture under realistic founder behaviour, so 6
// is the natural ceiling. Documented in docs/cross-venture-memory-plan.md
// §3 — change here AND in the doc if revisited.
export const CROSS_VENTURE_CYCLE_LIMIT = 6;

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

/**
 * One entry in the cross-venture context block. Carries the parsed
 * CycleSummary plus the venture name so the renderer can disambiguate
 * which arc each cycle belongs to. Cross-venture is Compound-tier-only;
 * Free + Execute always receive an empty array.
 */
export interface CrossVentureCycleEntry {
  ventureId:   string;
  ventureName: string;
  completedAt: string | null;
  summary:     CycleSummary;
}

export interface InterviewContext {
  profile: FounderProfile | null;
  cycleSummaries: CycleSummary[];
  crossVentureSummaries: CrossVentureCycleEntry[];
  forkContext: string | null;
}

export interface RecommendationContext {
  profile: FounderProfile | null;
  cycleSummaries: CycleSummary[];
  crossVentureSummaries: CrossVentureCycleEntry[];
}

export interface RoadmapContext {
  profile: FounderProfile | null;
  latestCycleSummary: CycleSummary | null;
  crossVentureSummaries: CrossVentureCycleEntry[];
}

export interface PerTaskAgentContext {
  profile: FounderProfile | null;
  crossVentureSummaries: CrossVentureCycleEntry[];
}

export interface ContinuationBriefContext {
  profile: FounderProfile | null;
  cycleSummaries: CycleSummary[];
  crossVentureSummaries: CrossVentureCycleEntry[];
}

export interface CycleSummaryGeneratorContext {
  recommendation: { path: string; summary: string; reasoning: string; recommendationType: string | null } | null;
  roadmapPhases: unknown;
  continuationBrief: string | null;
  roadmapProgress: { totalTasks: number; completedTasks: number; blockedTasks: number } | null;
  cycleCreatedAt: string;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/**
 * Interview agent (fresh_start or fork_continuation).
 * Returns profile + (for fork) all prior Cycle Summaries in the
 * venture.
 */
export async function loadInterviewContext(
  userId: string,
  scenario: 'fresh_start' | 'fork_continuation',
  options: { ventureId?: string; forkContext?: string } = {},
): Promise<InterviewContext> {
  const profile = await loadProfile(userId);
  const crossVentureSummaries = await loadCrossVentureSummaries(userId, options.ventureId ?? null);

  if (scenario === 'fresh_start' || !options.ventureId) {
    return { profile, cycleSummaries: [], crossVentureSummaries, forkContext: null };
  }

  const summaries = await loadVentureSummaries(options.ventureId);
  return {
    profile,
    cycleSummaries: summaries,
    crossVentureSummaries,
    forkContext: options.forkContext ?? null,
  };
}

/**
 * Recommendation synthesis agent.
 * Returns profile + all Cycle Summaries for the venture.
 */
export async function loadRecommendationContext(
  userId: string,
  ventureId: string,
): Promise<RecommendationContext> {
  const profile               = await loadProfile(userId);
  const summaries             = await loadVentureSummaries(ventureId);
  const crossVentureSummaries = await loadCrossVentureSummaries(userId, ventureId);
  return { profile, cycleSummaries: summaries, crossVentureSummaries };
}

/**
 * Roadmap generator.
 * Returns profile + latest Cycle Summary only (for speed calibration).
 */
export async function loadRoadmapContext(
  userId: string,
  ventureId: string,
): Promise<RoadmapContext> {
  const profile               = await loadProfile(userId);
  const summaries             = await loadVentureSummaries(ventureId);
  const crossVentureSummaries = await loadCrossVentureSummaries(userId, ventureId);
  return { profile, latestCycleSummary: summaries[0] ?? null, crossVentureSummaries };
}

/**
 * Per-task agents (Coach, Composer, Research, Packager, check-in).
 * Returns Founder Profile only — no Cycle Summaries, no venture
 * history. These agents stay lightweight per the spec's caching
 * strategy.
 */
export async function loadPerTaskAgentContext(
  userId: string,
  options: { currentVentureId?: string | null } = {},
): Promise<PerTaskAgentContext> {
  const profile               = await loadProfile(userId);
  const crossVentureSummaries = await loadCrossVentureSummaries(
    userId,
    options.currentVentureId ?? null,
  );
  return { profile, crossVentureSummaries };
}

/**
 * Continuation brief agent.
 * Returns profile + all Cycle Summaries for the venture.
 */
export async function loadContinuationBriefContext(
  userId: string,
  ventureId: string,
): Promise<ContinuationBriefContext> {
  const profile               = await loadProfile(userId);
  const summaries             = await loadVentureSummaries(ventureId);
  const crossVentureSummaries = await loadCrossVentureSummaries(userId, ventureId);
  return { profile, cycleSummaries: summaries, crossVentureSummaries };
}

/**
 * Cycle Summary generator (Inngest job).
 * Returns raw cycle data — no profile, no prior summaries. This job
 * is the one that CREATES the summary, so it reads the source data
 * directly.
 */
export async function loadCycleSummaryGeneratorContext(
  cycleId: string,
): Promise<CycleSummaryGeneratorContext> {
  const cycle = await prisma.cycle.findUnique({
    where:  { id: cycleId },
    select: {
      createdAt: true,
      recommendation: {
        select: {
          path: true, summary: true, reasoning: true, recommendationType: true,
          roadmap: {
            select: {
              phases: true,
              continuationBrief: true,
              progress: { select: { totalTasks: true, completedTasks: true, blockedTasks: true } },
            },
          },
        },
      },
    },
  });

  if (!cycle) {
    return { recommendation: null, roadmapPhases: null, continuationBrief: null, roadmapProgress: null, cycleCreatedAt: new Date().toISOString() };
  }

  const rec = cycle.recommendation;
  const roadmap = rec?.roadmap;
  return {
    recommendation: rec ? { path: rec.path, summary: rec.summary, reasoning: rec.reasoning, recommendationType: rec.recommendationType } : null,
    roadmapPhases:     roadmap?.phases ?? null,
    continuationBrief: roadmap?.continuationBrief as string | null ?? null,
    roadmapProgress:   roadmap?.progress ?? null,
    cycleCreatedAt:    cycle.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadProfile(userId: string): Promise<FounderProfile | null> {
  const row = await prisma.founderProfile.findUnique({
    where:  { userId },
    select: { profile: true },
  });
  if (!row) return null;
  return safeParseFounderProfile(row.profile);
}

async function loadVentureSummaries(ventureId: string): Promise<CycleSummary[]> {
  const cycles = await prisma.cycle.findMany({
    where:   { ventureId, status: 'completed' },
    orderBy: { cycleNumber: 'desc' },
    select:  { summary: true },
  });
  const summaries: CycleSummary[] = [];
  for (const c of cycles) {
    if (!c.summary) continue;
    const parsed = safeParseCycleSummary(c.summary);
    if (parsed) summaries.push(parsed);
  }
  return summaries;
}

/**
 * Load the cross-venture context block source data — the most-recent
 * completed cycles across all OTHER ventures owned by this user.
 *
 * Tier-gated: returns `[]` for any tier other than Compound. The gate
 * lives here (not in the per-agent loaders) so every consumer reads the
 * same shape and there is one source of truth for the rule.
 *
 * Excludes:
 *   - cycles in the current venture (the existing single-venture
 *     summaries already cover those)
 *   - cycles in archived ventures (tier-downgrade overflow — the
 *     founder cannot reach those ventures until they upgrade, so
 *     surfacing memories from them produces UX dead-ends)
 *   - non-completed cycles (in_progress has no summary; abandoned arcs
 *     are not memories we want to over-weight)
 *
 * Bound: at most CROSS_VENTURE_CYCLE_LIMIT rows, ordered most-recent-
 * completed first. The terminal cycle of each other-venture arc wins
 * the most-recent slot before older cycles from the same venture do —
 * which gives the agent the lesson at venture-outcome granularity, not
 * the branch-point granularity. Documented in
 * docs/cross-venture-memory-plan.md §5.
 */
export async function loadCrossVentureSummaries(
  userId: string,
  currentVentureId: string | null,
): Promise<CrossVentureCycleEntry[]> {
  const tier = await getUserTier(userId);
  if (tier !== 'compound') return [];

  const cycles = await prisma.cycle.findMany({
    where: {
      status: 'completed',
      // The relational filter is THE security boundary: every row
      // returned must belong to a venture owned by this user. The
      // archivedAt + status guards remove ventures the founder cannot
      // currently act on. Removing or weakening any clause here turns
      // cross-venture memory into a cross-USER leak.
      venture: {
        userId,
        archivedAt: null,
        status: { in: ['active', 'paused', 'completed'] },
        ...(currentVentureId ? { id: { not: currentVentureId } } : {}),
      },
    },
    orderBy: [
      { completedAt: 'desc' },
      { cycleNumber: 'desc' },
    ],
    take: CROSS_VENTURE_CYCLE_LIMIT,
    select: {
      ventureId:   true,
      completedAt: true,
      summary:     true,
      venture:     { select: { name: true } },
    },
  });

  const entries: CrossVentureCycleEntry[] = [];
  for (const c of cycles) {
    if (!c.summary) continue;
    const parsed = safeParseCycleSummary(c.summary);
    if (!parsed) continue;
    entries.push({
      ventureId:   c.ventureId,
      ventureName: c.venture?.name ?? 'Untitled venture',
      completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      summary:     parsed,
    });
  }
  return entries;
}
