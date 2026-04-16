// src/app/api/user/linked-providers/route.ts
//
// GET /api/user/linked-providers
//
// Returns which OAuth providers (google, github) this account has
// linked. Used by the mobile Settings screen to render "Connected
// accounts" rows so the founder can see at a glance how they signed in.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  httpErrorToResponse,
  requireUserId,
} from '@/lib/validation/server-helpers';

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);

    const accounts = await prisma.account.findMany({
      where:  { userId },
      select: { provider: true },
    });

    // De-duplicate in case there's ever a bug that wrote two rows for
    // the same provider — rendering the same row twice would look
    // broken even if the underlying data is harmless.
    const providers = Array.from(new Set(accounts.map(a => a.provider)));

    return NextResponse.json({ providers });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
