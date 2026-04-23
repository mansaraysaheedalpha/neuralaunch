// src/app/api/discovery/ventures/route.ts
//
// GET /api/discovery/ventures
//
// Returns the founder's ventures with their cycles, plus per-active-
// venture roadmap-progress counts, plus the tier cap so the client can
// render "You can have N active ventures on your Execute plan" copy
// without a second round-trip.
//
// Shape mirrors the data the web server-component
// (client/src/app/(app)/discovery/recommendations/page.tsx) assembles
// inline — the page stays on direct Prisma while this REST endpoint
// exposes the same result to mobile.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { TIER_VENTURE_LIMITS, type Tier } from '@/lib/paddle/tiers';

const MAX_VENTURES = 50;

export async function GET() {
  try {
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'ventures-list', RATE_LIMITS.API_READ);

    const [ventures, subscription] = await Promise.all([
      prisma.venture.findMany({
        where:   { userId },
        orderBy: { updatedAt: 'desc' },
        take:    MAX_VENTURES,
        select: {
          id: true, name: true, status: true, currentCycleId: true,
          archivedAt: true, updatedAt: true,
          cycles: {
            orderBy: { cycleNumber: 'asc' },
            select: {
              id: true, cycleNumber: true, status: true,
              selectedForkSummary: true, roadmapId: true,
              createdAt: true, completedAt: true,
            },
          },
        },
      }),
      prisma.subscription.findUnique({
        where:  { userId },
        select: { tier: true },
      }),
    ]);

    const tier: Tier =
      subscription?.tier === 'execute' || subscription?.tier === 'compound'
        ? subscription.tier
        : 'free';
    const cap = TIER_VENTURE_LIMITS[tier];

    // Roadmap progress — only fetched for active ventures since that's
    // where the progress bar renders. Paused / completed / archived
    // cards don't animate a bar so there's no point paying the cost.
    const activeVentureIds = ventures.filter(v => v.status === 'active' && !v.archivedAt).map(v => v.id);
    const progressMap = new Map<string, { completedTasks: number; totalTasks: number }>();
    if (activeVentureIds.length > 0) {
      const progresses = await prisma.roadmapProgress.findMany({
        where: { roadmap: { ventureId: { in: activeVentureIds } } },
        select: { roadmap: { select: { ventureId: true } }, completedTasks: true, totalTasks: true },
      });
      for (const p of progresses) {
        if (p.roadmap.ventureId) {
          progressMap.set(p.roadmap.ventureId, {
            completedTasks: p.completedTasks,
            totalTasks:     p.totalTasks,
          });
        }
      }
    }

    return NextResponse.json({
      tier,
      cap,
      ventures: ventures.map(v => ({
        id:             v.id,
        name:           v.name,
        status:         v.status,
        currentCycleId: v.currentCycleId,
        archivedAt:     v.archivedAt?.toISOString() ?? null,
        updatedAt:      v.updatedAt.toISOString(),
        progress:       progressMap.get(v.id) ?? null,
        cycles: v.cycles.map(cy => ({
          id:                   cy.id,
          cycleNumber:          cy.cycleNumber,
          status:               cy.status,
          selectedForkSummary:  cy.selectedForkSummary,
          roadmapId:            cy.roadmapId,
          createdAt:            cy.createdAt.toISOString(),
          completedAt:          cy.completedAt?.toISOString() ?? null,
        })),
      })),
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
