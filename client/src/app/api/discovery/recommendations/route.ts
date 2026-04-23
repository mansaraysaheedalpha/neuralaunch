// src/app/api/discovery/recommendations/route.ts
//
// GET /api/discovery/recommendations
//
// Returns the founder's recommendations as a flat list — one row per
// Recommendation, newest first. Consumed by the mobile Sessions tab's
// timeline and any non-venture-aware caller that needs a chronological
// view (the venture-grouped shape lives at /api/discovery/ventures).
//
// Always scoped to the caller via requireUserId (Bearer token on
// mobile, NextAuth session on web) so there is no way to read
// another founder's recommendations.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

const MAX_ROWS = 50;

export async function GET() {
  try {
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'recommendations-list', RATE_LIMITS.API_READ);

    const rows = await prisma.recommendation.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    MAX_ROWS,
      select: {
        id:                 true,
        path:               true,
        summary:            true,
        recommendationType: true,
        acceptedAt:         true,
        createdAt:          true,
      },
    });

    return NextResponse.json(
      rows.map(r => ({
        id:                 r.id,
        path:               r.path,
        summary:            r.summary,
        recommendationType: r.recommendationType,
        acceptedAt:         r.acceptedAt?.toISOString() ?? null,
        createdAt:          r.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
