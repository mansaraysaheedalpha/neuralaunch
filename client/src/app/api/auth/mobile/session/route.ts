// src/app/api/auth/mobile/session/route.ts
//
// GET /api/auth/mobile/session
//
// Returns the current user for a mobile Bearer token. Called by the
// mobile app on launch to validate the stored token and hydrate the
// auth state.

import { NextResponse } from 'next/server';
import { extractBearerToken, resolveUserFromToken } from '@/lib/mobile-auth';
import {
  httpErrorToResponse,
  rateLimitByIp,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

export async function GET(request: Request) {
  try {
    // IP-keyed because the bearer token is what we are about to
    // validate — no userId is trustable yet. API_READ tier (120/min)
    // is comfortable for app-launch revalidation while bounding token
    // enumeration attempts from a single host.
    await rateLimitByIp(request, 'mobile-session', RATE_LIMITS.API_READ);

    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const user = await resolveUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
