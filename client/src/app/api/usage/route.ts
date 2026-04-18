// src/app/api/usage/route.ts
//
// GET /api/usage — returns the signed-in user's per-cycle usage
// across the four AI-heavy tools. Powers the UsageMeter component on
// each standalone tool page.

import { NextResponse } from 'next/server';
import {
  enforceSameOrigin,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import { readAllCycleUsage } from '@/lib/billing/cycle-quota';

export async function GET(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'usage-read', RATE_LIMITS.API_READ);

    const usage = await readAllCycleUsage(userId);
    return NextResponse.json({ usage });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
