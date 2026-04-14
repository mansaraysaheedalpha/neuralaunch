// src/app/api/auth/mobile/session/route.ts
//
// GET /api/auth/mobile/session
//
// Returns the current user for a mobile Bearer token. Called by the
// mobile app on launch to validate the stored token and hydrate the
// auth state.

import { NextResponse } from 'next/server';
import { extractBearerToken, resolveUserFromToken } from '@/lib/mobile-auth';

export async function GET(request: Request) {
  const token = extractBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }

  const user = await resolveUserFromToken(token);

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  return NextResponse.json({ user });
}
