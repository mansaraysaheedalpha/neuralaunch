// src/app/api/discovery/roadmaps/[id]/continuation/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  safeParseContinuationBrief,
  safeParseDiagnosticHistory,
  safeParseParkingLot,
} from '@/lib/continuation';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export const maxDuration = 300;

/**
 * GET /api/discovery/roadmaps/[id]/continuation
 *
 * Polling endpoint the client uses while the brief is being
 * generated and to render the brief once it lands. Returns:
 *
 *   - continuationStatus  — null | CHECKING | DIAGNOSING |
 *                           GENERATING_BRIEF | BRIEF_READY |
 *                           FORK_SELECTED
 *   - continuationBrief   — full brief once status is BRIEF_READY
 *   - diagnosticHistory   — full chat transcript (Scenario A/B only)
 *   - parkingLot          — full parking-lot array
 *
 * READ-only. Read-tier rate limit. The client polls this every few
 * seconds while status is GENERATING_BRIEF.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'compound');
    await rateLimitByUser(userId, 'roadmap-continuation-read', RATE_LIMITS.API_READ);

    const { id: roadmapId } = await params;

    const row = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:                 true,
        continuationStatus: true,
        continuationBrief:  true,
        diagnosticHistory:  true,
        parkingLot:         true,
        executionMetrics:   true,
        parentRoadmapId:    true,
      },
    });
    if (!row) throw new HttpError(404, 'Not found');

    return NextResponse.json({
      id:                row.id,
      continuationStatus: row.continuationStatus,
      brief:             safeParseContinuationBrief(row.continuationBrief),
      diagnosticHistory: safeParseDiagnosticHistory(row.diagnosticHistory),
      parkingLot:        safeParseParkingLot(row.parkingLot),
      executionMetrics:  row.executionMetrics ?? null,
      parentRoadmapId:   row.parentRoadmapId,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
