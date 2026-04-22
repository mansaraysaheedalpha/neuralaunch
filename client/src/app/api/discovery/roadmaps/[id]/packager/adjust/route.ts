// src/app/api/discovery/roadmaps/[id]/packager/adjust/route.ts
//
// Standalone Service Packager — adjust route. Operates on a session
// inside roadmap.toolSessions identified by sessionId. Same MAX_ADJUSTMENT_ROUNDS
// cap and same engine as the task-level adjust route.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  HttpError, httpErrorToResponse, requireUserId,
  enforceSameOrigin, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import {
  MAX_ADJUSTMENT_ROUNDS, runPackagerAdjustment, safeParsePackagerSession,
} from '@/lib/roadmap/service-packager';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';

export const maxDuration = 300;

const BodySchema = z.object({
  sessionId:         z.string().min(1),
  adjustmentRequest: z.string().min(1).max(2000),
});

/**
 * POST /api/discovery/roadmaps/[id]/packager/adjust
 *
 * Applies one adjustment to a standalone packager session (resolved
 * by sessionId from roadmap.toolSessions). Rejects with 409 once
 * MAX_ADJUSTMENT_ROUNDS is reached.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'packager');
    await rateLimitByUser(userId, 'packager-standalone-adjust', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST packager-standalone-adjust', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true, recommendation: { select: { session: { select: { beliefState: true } } } } },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>) : [];
    const existing = rawSessions.find(s => s['id'] === parsed.data.sessionId);
    if (!existing) throw new HttpError(404, 'Session not found');

    const session = safeParsePackagerSession(existing);
    if (!session?.package) throw new HttpError(409, 'No generated package found. Run generate first.');

    const priorAdjustments = session.adjustments ?? [];
    if (priorAdjustments.length >= MAX_ADJUSTMENT_ROUNDS) {
      throw new HttpError(409, `Adjustment limit reached (${MAX_ADJUSTMENT_ROUNDS} adjustments maximum).`);
    }
    const round = priorAdjustments.length + 1;

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

    const updatedPackage = await runPackagerAdjustment({
      existingPackage:    session.package,
      context:            session.context,
      priorAdjustments,
      adjustmentRequest:  parsed.data.adjustmentRequest,
      round,
      beliefState: {
        geographicMarket:     bs?.geographicMarket?.value as string | null ?? null,
        availableTimePerWeek: bs?.availableTimePerWeek?.value as string | null ?? null,
      },
    });

    const updatedSession = {
      ...existing,
      package:     updatedPackage,
      adjustments: [...priorAdjustments, { request: parsed.data.adjustmentRequest, round }],
      updatedAt:   new Date().toISOString(),
    };
    const others = rawSessions.filter(s => s['id'] !== parsed.data.sessionId);

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { toolSessions: toJsonValue([...others, updatedSession]) },
    });

    log.info('[StandalonePackager] Adjustment persisted', { sessionId: parsed.data.sessionId, round });
    return NextResponse.json({ package: updatedPackage, round, adjustmentsRemaining: MAX_ADJUSTMENT_ROUNDS - round });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
