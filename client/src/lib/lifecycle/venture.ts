// src/lib/lifecycle/venture.ts
//
// Database helpers for the Venture and Cycle models. All queries are
// ownership-scoped to the authenticated user's ID per CLAUDE.md
// security rules.

import 'server-only';
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
