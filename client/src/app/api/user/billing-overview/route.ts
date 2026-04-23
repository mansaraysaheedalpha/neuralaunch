// src/app/api/user/billing-overview/route.ts
//
// GET /api/user/billing-overview
//
// Returns the billing snapshot mobile needs to render its Settings >
// Billing card — tier, status, founding-member flag, period-end,
// cancel-at-period-end, plus the returning-user fields mobile uses
// for the welcome-back banner.
//
// Mirrors the inline Prisma query the web server-component performs
// in client/src/app/(app)/settings/page.tsx. Pulled out to REST so
// mobile consumes the same data without duplicating the query.

import { NextResponse } from 'next/server';
import prisma           from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

export async function GET() {
  try {
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'billing-overview-get', RATE_LIMITS.API_READ);

    const user = await prisma.user.findFirst({
      where:  { id: userId },
      select: {
        name:              true,
        wasFoundingMember: true,
        lastPaidTier:      true,
        paddleCustomerId:  true,
        subscription: {
          select: {
            status:            true,
            tier:              true,
            isFoundingMember:  true,
            cancelAtPeriodEnd: true,
            currentPeriodEnd:  true,
          },
        },
      },
    });

    if (!user) throw new HttpError(404, 'User not found');

    const sub = user.subscription;
    const tier = (sub?.tier ?? 'free') as 'free' | 'execute' | 'compound';

    return NextResponse.json({
      tier,
      status:             sub?.status ?? 'free',
      isFoundingMember:   sub?.isFoundingMember ?? false,
      cancelAtPeriodEnd:  sub?.cancelAtPeriodEnd ?? false,
      currentPeriodEnd:   sub?.currentPeriodEnd?.toISOString() ?? null,
      hasBillingProfile:  !!user.paddleCustomerId,
      userName:           user.name,
      lastPaidTier:       (user.lastPaidTier ?? null) as 'execute' | 'compound' | null,
      wasFoundingMember:  user.wasFoundingMember,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
