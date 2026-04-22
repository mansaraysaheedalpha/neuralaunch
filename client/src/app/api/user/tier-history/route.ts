// src/app/api/user/tier-history/route.ts
//
// GET /api/user/tier-history
//
// Returns the founder's last ten subscription / tier transitions for
// display in the Settings > Subscription history panel. Mirrors the
// data the web server-component reads inline via prisma — exposed as
// REST so mobile can consume the same list without duplicating
// Prisma queries client-side.
//
// Response shape matches the web's TierHistoryEntry + wasFoundingMember
// flag so the mobile UI can render identical copy.

import { NextResponse } from 'next/server';
import prisma           from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

const MAX_ENTRIES = 10;

export async function GET() {
  try {
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'tier-history-get', RATE_LIMITS.API_READ);

    const [user, transitions] = await Promise.all([
      prisma.user.findFirst({
        where:  { id: userId },
        select: { wasFoundingMember: true },
      }),
      prisma.tierTransition.findMany({
        where:   { userId },
        orderBy: { occurredAt: 'desc' },
        take:    MAX_ENTRIES,
        select: {
          id:              true,
          fromTier:        true,
          toTier:          true,
          paddleEventType: true,
          occurredAt:      true,
        },
      }),
    ]);

    if (!user) throw new HttpError(404, 'User not found');

    return NextResponse.json({
      wasFoundingMember: user.wasFoundingMember,
      transitions: transitions.map(t => ({
        id:              t.id,
        fromTier:        t.fromTier,
        toTier:          t.toTier,
        paddleEventType: t.paddleEventType,
        occurredAt:      t.occurredAt.toISOString(),
      })),
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
