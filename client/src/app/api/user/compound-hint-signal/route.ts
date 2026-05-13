// src/app/api/user/compound-hint-signal/route.ts
//
// GET /api/user/compound-hint-signal
//
// Returns { shouldShow } for the mobile CompoundUpgradeHint banner.
// The signal mirrors the web's server-component computation in
// client/src/app/(app)/discovery/page.tsx line 150:
//
//   tier === 'execute' && nonActiveVentureCount >= 1 && !incomplete
//
// On web the dispatch is part of the server-component render so it
// can read session+ventures inline. Mobile fetches this endpoint
// from the archetype-picker entry; "incomplete" is handled separately
// by the existing resumption flow, so we do NOT factor it in here —
// callers should suppress the hint themselves when a resumable
// session is in play.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import { getUserTier } from '@/lib/lifecycle/tier-limits';

export type CompoundHintSignalResponse = {
  shouldShow: boolean;
};

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);
    // API_READ tier — read-only and called on discovery entry, so a
    // cheap rate-limit avoids abuse without burdening normal use.
    await rateLimitByUser(userId, 'compound-hint-signal', RATE_LIMITS.API_READ);

    const tier = await getUserTier(userId);
    if (tier !== 'execute') {
      const body: CompoundHintSignalResponse = { shouldShow: false };
      return NextResponse.json(body);
    }

    // Same filter the web page.tsx applies: paused or completed,
    // non-archived ventures. Count is cheap (indexed).
    const nonActiveVentureCount = await prisma.venture.count({
      where: {
        userId,
        status:     { in: ['paused', 'completed'] },
        archivedAt: null,
      },
    });

    const body: CompoundHintSignalResponse = {
      shouldShow: nonActiveVentureCount >= 1,
    };
    return NextResponse.json(body);
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
