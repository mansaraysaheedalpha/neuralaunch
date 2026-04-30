// src/app/api/discovery/validation/has-any/route.ts
//
// Lightweight check: does this user have at least one ValidationPage?
// Used by the sidebar to conditionally render the "Validation pages"
// link — the link only makes sense once a page exists, otherwise it
// leads to an empty list. Mirrors /api/discovery/roadmaps/has-any.

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
    await rateLimitByUser(userId, 'has-any-validation-page', RATE_LIMITS.API_READ);

    // ValidationPage carries userId directly (denormalised across all
    // three creation paths: recommendation-bound, task-bound, truly-
    // standalone). One indexed query (@@index([userId])) is enough.
    // findFirst + select:{id:true} is intentional — yes/no only, no row
    // payload, no archivedAt filter (an archived page is still a page
    // the user created and can browse from the list).
    const page = await prisma.validationPage.findFirst({
      where:  { userId },
      select: { id: true },
    });

    return NextResponse.json({ hasValidationPage: !!page });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
