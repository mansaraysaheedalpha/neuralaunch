// src/app/api/discovery/roadmaps/has-any/route.ts
//
// Lightweight check: does this user have at least one roadmap?
// Used by the sidebar to conditionally render the Tools section.
// No sensitive data returned — just a boolean.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

export async function GET() {
  try {
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'has-any-roadmap', RATE_LIMITS.API_READ);

    // Return the most recent roadmap ID so standalone tools can
    // auto-load the founder's context without a second round-trip.
    const roadmap = await prisma.roadmap.findFirst({
      where:   { userId },
      select:  { id: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      hasRoadmap: !!roadmap,
      roadmapId:  roadmap?.id ?? null,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
