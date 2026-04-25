// src/lib/lifecycle/venture.ts
//
// Database helpers for the Venture and Cycle models. All queries are
// ownership-scoped to the authenticated user's ID per CLAUDE.md
// security rules.

import 'server-only';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

// Re-export Prisma's generated types narrowed to what callers need.
// This avoids leaking the full Prisma model shape outside the module
// while still giving callers typed results without a manual interface.
type Venture = Awaited<ReturnType<typeof prisma.venture.findFirst>> & {};
type Cycle   = Awaited<ReturnType<typeof prisma.cycle.findFirst>> & {};

export type { Venture, Cycle };

/**
 * Return all active ventures for a user, ordered by most recent
 * activity (updatedAt desc). Used by the Sessions tab and the
 * interview-start flow to check active-venture limits.
 */
export async function getActiveVentures(userId: string) {
  return prisma.venture.findMany({
    where:   { userId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
    include: {
      cycles: {
        orderBy: { cycleNumber: 'asc' },
        select:  { id: true, cycleNumber: true, status: true, summary: true, selectedForkSummary: true, createdAt: true, completedAt: true },
      },
    },
  });
}

/**
 * Return the in-progress cycle for a venture, null if none exists
 * (venture is paused/completed or between cycles).
 */
export async function getCurrentCycle(ventureId: string) {
  return prisma.cycle.findFirst({
    where: { ventureId, status: 'in_progress' },
    select: {
      id: true, cycleNumber: true, status: true,
      roadmapId: true, summary: true,
      createdAt: true,
    },
  });
}

/**
 * Create a new venture in active state with no cycles yet. The
 * first cycle is created separately when the interview completes
 * and a recommendation is generated.
 */
export async function createVenture(userId: string, name: string) {
  return prisma.venture.create({
    data: { userId, name, status: 'active' },
  });
}

/**
 * Create a new cycle within a venture. The cycle starts in
 * in_progress state. Recommendation and roadmap are linked later
 * as the lifecycle progresses.
 */
export async function createCycle(ventureId: string, cycleNumber: number) {
  return prisma.cycle.create({
    data: { ventureId, cycleNumber, status: 'in_progress' },
  });
}

/**
 * Derive a sensible default venture name from the first accepted
 * recommendation. The recommendation's `path` is a terse imperative
 * phrase ("Build a scheduling bot for Lagos restaurants") — exactly
 * the shape a founder would naturally use to name the thing they're
 * working on. Trimmed to 80 characters to fit the sidebar cleanly.
 * The founder can rename from the Sessions tab afterwards.
 */
export function deriveVentureName(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return 'Untitled venture';
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 77).trimEnd() + '...';
}

/**
 * Bootstrap the Venture + Cycle pair for a freshly-accepted
 * recommendation that is not yet linked to a cycle. Runs inside the
 * caller's transaction so the venture, cycle, and
 * recommendation.cycleId update commit atomically with acceptedAt.
 *
 * Caller is responsible for running `assertVentureLimitNotReached`
 * before entering the transaction — the cap check uses non-tx reads
 * and threading it through here would force every tx to re-count
 * active ventures for no safety benefit (the race window is
 * microseconds and the worst case is a single overflow venture,
 * which the Sessions-tab archive/restore flow can resolve later).
 *
 * Idempotency: DOES NOT check whether the recommendation already has
 * a cycleId. The caller MUST check that before entering the tx. This
 * helper is the happy-path bootstrap only.
 */
export async function bootstrapVentureAndCycleForRecommendation(
  tx: Prisma.TransactionClient,
  input: {
    userId:             string;
    recommendationId:   string;
    recommendationPath: string;
  },
): Promise<{ ventureId: string; cycleId: string }> {
  const venture = await tx.venture.create({
    data: {
      userId: input.userId,
      name:   deriveVentureName(input.recommendationPath),
      status: 'active',
    },
    select: { id: true },
  });

  const cycle = await tx.cycle.create({
    data: {
      ventureId:   venture.id,
      cycleNumber: 1,
      status:      'in_progress',
    },
    select: { id: true },
  });

  await tx.venture.update({
    where: { id: venture.id },
    data:  { currentCycleId: cycle.id },
  });

  return { ventureId: venture.id, cycleId: cycle.id };
}

/**
 * Create the next Cycle in an existing Venture — called from the
 * fork-selection transaction. Numbers the new cycle one above the
 * current max cycleNumber for the venture and flips the venture's
 * currentCycleId pointer to the new row. Returns the new cycle id
 * so the caller can link the fork-derived Recommendation to it.
 *
 * The parent Cycle's status is NOT changed here — the Lifecycle
 * Transition Engine sets it to 'completed' when it fires on the
 * 'neuralaunch/cycle.completing' event emitted by the continuation
 * brief function. Overwriting status here would double-write that
 * field and could race the transition.
 */
export async function createNextCycleForVenture(
  tx: Prisma.TransactionClient,
  ventureId: string,
): Promise<{ cycleId: string; cycleNumber: number }> {
  const latestCycle = await tx.cycle.findFirst({
    where:   { ventureId },
    orderBy: { cycleNumber: 'desc' },
    select:  { cycleNumber: true },
  });
  const nextCycleNumber = (latestCycle?.cycleNumber ?? 0) + 1;

  const cycle = await tx.cycle.create({
    data: {
      ventureId,
      cycleNumber: nextCycleNumber,
      status:      'in_progress',
    },
    select: { id: true },
  });

  await tx.venture.update({
    where: { id: ventureId },
    data:  { currentCycleId: cycle.id },
  });

  return { cycleId: cycle.id, cycleNumber: nextCycleNumber };
}

/**
 * Return all ventures (any status) for a user, ordered by most
 * recent activity. Used by the Sessions tab to render the full
 * venture list with active, paused, and completed sections.
 */
export async function getAllVentures(userId: string) {
  return prisma.venture.findMany({
    where:   { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      cycles: {
        orderBy: { cycleNumber: 'asc' },
        select:  {
          id: true, cycleNumber: true, status: true,
          summary: true, selectedForkSummary: true,
          roadmapId: true,
          createdAt: true, completedAt: true,
        },
      },
    },
  });
}
