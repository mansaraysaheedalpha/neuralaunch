// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/packager/adjust/route.ts
//
// Task-level Service Packager — adjust route.
// Enforces MAX_ADJUSTMENT_ROUNDS, calls runPackagerAdjustment with the
// current package, persists the modified package and appends to the
// adjustments array on the task's packagerSession.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  HttpError, httpErrorToResponse, requireUserId,
  enforceSameOrigin, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { StoredPhasesArraySchema, readTask, patchTask, type StoredRoadmapPhase } from '@/lib/roadmap/checkin-types';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import {
  MAX_ADJUSTMENT_ROUNDS, runPackagerAdjustment, safeParsePackagerSession,
} from '@/lib/roadmap/service-packager';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export const maxDuration = 60;

const BodySchema = z.object({
  adjustmentRequest: z.string().min(1).max(2000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/packager/adjust
 *
 * Applies one adjustment to the task's packagerSession.package.
 * Rejects with 409 once MAX_ADJUSTMENT_ROUNDS is reached.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'packager-task-adjust', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    const log = logger.child({ route: 'POST packager-task-adjust', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true, recommendation: { select: { session: { select: { beliefState: true } } } } },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');
    const phases: StoredRoadmapPhase[] = phasesParsed.data;
    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    const session = safeParsePackagerSession(found.task.packagerSession);
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
      ...session,
      package:     updatedPackage,
      adjustments: [...priorAdjustments, { request: parsed.data.adjustmentRequest, round }],
      updatedAt:   new Date().toISOString(),
    };

    const next = patchTask(phases, taskId, t => ({ ...t, packagerSession: updatedSession }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    await prisma.roadmap.update({ where: { id: roadmapId }, data: { phases: toJsonValue(next) } });

    log.info('[PackagerTask] Adjustment persisted', { taskId, round, totalAdjustments: round });
    return NextResponse.json({ package: updatedPackage, round, adjustmentsRemaining: MAX_ADJUSTMENT_ROUNDS - round });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
