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

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface InterviewContext {
  profile: FounderProfile | null;
  cycleSummaries: CycleSummary[];
  forkContext: string | null;
}

export interface RecommendationContext {
  profile: FounderProfile | null;
  cycleSummaries: CycleSummary[];
}

export interface RoadmapContext {
  profile: FounderProfile | null;
  latestCycleSummary: CycleSummary | null;
}

export interface PerTaskAgentContext {
  profile: FounderProfile | null;
}

export interface ContinuationBriefContext {
  profile: FounderProfile | null;
  cycleSummaries: CycleSummary[];
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

  if (scenario === 'fresh_start' || !options.ventureId) {
    return { profile, cycleSummaries: [], forkContext: null };
  }

  const summaries = await loadVentureSummaries(options.ventureId);
  return { profile, cycleSummaries: summaries, forkContext: options.forkContext ?? null };
}

/**
 * Recommendation synthesis agent.
 * Returns profile + all Cycle Summaries for the venture.
 */
export async function loadRecommendationContext(
  userId: string,
  ventureId: string,
): Promise<RecommendationContext> {
  const profile   = await loadProfile(userId);
  const summaries = await loadVentureSummaries(ventureId);
  return { profile, cycleSummaries: summaries };
}

/**
 * Roadmap generator.
 * Returns profile + latest Cycle Summary only (for speed calibration).
 */
export async function loadRoadmapContext(
  userId: string,
  ventureId: string,
): Promise<RoadmapContext> {
  const profile   = await loadProfile(userId);
  const summaries = await loadVentureSummaries(ventureId);
  return { profile, latestCycleSummary: summaries[0] ?? null };
}

/**
 * Per-task agents (Coach, Composer, Research, Packager, check-in).
 * Returns Founder Profile only — no Cycle Summaries, no venture
 * history. These agents stay lightweight per the spec's caching
 * strategy.
 */
export async function loadPerTaskAgentContext(
  userId: string,
): Promise<PerTaskAgentContext> {
  const profile = await loadProfile(userId);
  return { profile };
}

/**
 * Continuation brief agent.
 * Returns profile + all Cycle Summaries for the venture.
 */
export async function loadContinuationBriefContext(
  userId: string,
  ventureId: string,
): Promise<ContinuationBriefContext> {
  const profile   = await loadProfile(userId);
  const summaries = await loadVentureSummaries(ventureId);
  return { profile, cycleSummaries: summaries };
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
