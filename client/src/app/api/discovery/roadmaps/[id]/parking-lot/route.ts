// src/app/api/discovery/roadmaps/[id]/parking-lot/route.ts
import { NextResponse } from 'next/server';
import { z }            from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger }       from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  PARKING_LOT_IDEA_MAX_LENGTH,
  safeParseParkingLot,
  buildParkingLotItem,
  appendParkingLotItem,
} from '@/lib/continuation';

export const maxDuration = 30;

const BodySchema = z.object({
  idea:        z.string().min(1).max(PARKING_LOT_IDEA_MAX_LENGTH),
  taskContext: z.string().max(300).optional(),
});

/**
 * POST /api/discovery/roadmaps/[id]/parking-lot
 *
 * Manual "Park this idea" — the founder explicitly types something
 * they want to remember but not act on yet. Persists to the
 * Roadmap.parkingLot JSONB column. Returns the full updated array.
 *
 * Companion path to the auto-capture vector inside the check-in
 * route, which appends parking-lot items emitted by the agent.
 *
 * Returns:
 *   200 — appended successfully (parkingLot in body)
 *   404 — roadmap not found / not owned by caller
 *   409 — duplicate idea OR parking-lot cap reached
 *   429 — per-user rate limit exceeded
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    // Manual park is a state-changing write but does NOT call an LLM,
    // so it lives on the API_AUTHENTICATED tier rather than AI_GENERATION.
    await rateLimitByUser(userId, 'roadmap-parking-lot', RATE_LIMITS.API_AUTHENTICATED);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST roadmap-parking-lot', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    // Single-query ownership scope. Pull only the fields we need.
    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, parkingLot: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const current = safeParseParkingLot(roadmap.parkingLot);
    const item    = buildParkingLotItem({
      idea:         parsed.data.idea,
      surfacedFrom: 'manual',
      taskContext:  parsed.data.taskContext ?? null,
    });

    const outcome = appendParkingLotItem(current, item);
    if (!outcome.ok) {
      const message = outcome.reason === 'cap_reached'
        ? 'Parking lot is full — review or remove items before adding new ones.'
        : 'You already parked this idea.';
      throw new HttpError(409, message);
    }

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { parkingLot: toJsonValue(outcome.parkingLot) },
    });

    log.info('Parking lot item added (manual)', { itemId: item.id });

    return NextResponse.json({
      parkingLot: outcome.parkingLot,
      added:      item,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
