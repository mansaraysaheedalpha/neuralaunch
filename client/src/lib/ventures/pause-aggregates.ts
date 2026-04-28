// src/lib/ventures/pause-aggregates.ts
//
// Server-side aggregate query that powers the pause-reason agent's
// mirror-mode gating + the venture-context block. Reads only the
// founder's own ventures (ownership-scoped) and computes four
// signals fast — single Prisma findMany, no N+1.

import 'server-only';
import prisma from '@/lib/prisma';
import type { CrossVentureAggregates } from './pause-reason-engine';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Aggregate the founder's pause history for the pause-reason agent.
 * Excludes the venture currently being paused so the signals reflect
 * pattern, not the in-flight action.
 *
 * - currentlyPausedCount        — non-archived ventures with status='paused'
 * - totalPausedLast90Days       — distinct ventures paused at least once
 *                                  in the last 90 days (uses pausedAt)
 * - avgCompletionRatioOnPaused  — mean across currently-paused ventures
 *                                  of completedTasks / totalTasks (per
 *                                  the active cycle's RoadmapProgress).
 *                                  0 when no paused ventures.
 * - daysSinceLastPause          — days since the most recent active→paused
 *                                  transition the founder made, prior to
 *                                  this one. Null if they've never paused.
 * - priorReframeOrMirrorCount   — count of past pauseReasonMode rows in
 *                                  ('reframe', 'mirror'), excluding the
 *                                  current venture.
 */
export async function loadCrossVentureAggregatesForPause(input: {
  userId:           string;
  excludeVentureId: string;
}): Promise<CrossVentureAggregates> {
  const { userId, excludeVentureId } = input;
  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  const ventures = await prisma.venture.findMany({
    where: {
      userId,
      id: { not: excludeVentureId },
      archivedAt: null,
    },
    select: {
      id:              true,
      status:          true,
      pausedAt:        true,
      pauseReasonMode: true,
      roadmaps: {
        select: {
          progress: { select: { completedTasks: true, totalTasks: true } },
        },
      },
    },
  });

  let currentlyPausedCount    = 0;
  let totalPausedLast90Days   = 0;
  let priorReframeOrMirrorCount = 0;
  let mostRecentPausedAt: Date | null = null;
  const pausedCompletionRatios: number[] = [];

  for (const v of ventures) {
    if (v.pausedAt && v.pausedAt >= ninetyDaysAgo) totalPausedLast90Days++;
    if (v.pausedAt && (mostRecentPausedAt === null || v.pausedAt > mostRecentPausedAt)) {
      mostRecentPausedAt = v.pausedAt;
    }
    if (v.pauseReasonMode === 'reframe' || v.pauseReasonMode === 'mirror') {
      priorReframeOrMirrorCount++;
    }
    if (v.status === 'paused') {
      currentlyPausedCount++;
      // Mean across the venture's roadmaps' progress rows. A venture
      // with multiple roadmaps (multi-cycle) averages its cycles'
      // completion ratios so a long-paused venture doesn't get
      // double-weight from one cycle.
      const ratios: number[] = [];
      for (const r of v.roadmaps) {
        if (r.progress && r.progress.totalTasks > 0) {
          ratios.push(r.progress.completedTasks / r.progress.totalTasks);
        }
      }
      if (ratios.length > 0) {
        pausedCompletionRatios.push(ratios.reduce((a, b) => a + b, 0) / ratios.length);
      }
    }
  }

  const avgCompletionRatioOnPaused = pausedCompletionRatios.length === 0
    ? 0
    : pausedCompletionRatios.reduce((a, b) => a + b, 0) / pausedCompletionRatios.length;

  const daysSinceLastPause = mostRecentPausedAt === null
    ? null
    : Math.max(0, Math.round((Date.now() - mostRecentPausedAt.getTime()) / (24 * 60 * 60 * 1000)));

  return {
    currentlyPausedCount,
    totalPausedLast90Days,
    avgCompletionRatioOnPaused,
    daysSinceLastPause,
    priorReframeOrMirrorCount,
  };
}
