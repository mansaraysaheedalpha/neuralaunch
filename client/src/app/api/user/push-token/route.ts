// src/app/api/user/push-token/route.ts
//
// Mobile clients POST their Expo push token here on sign-in and
// whenever the token rotates. We upsert on the unique token so a
// re-registration is idempotent and safe.

import { NextResponse } from 'next/server';
import { z }            from 'zod';
import prisma           from '@/lib/prisma';
import { logger }       from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

const BodySchema = z.object({
  token:    z.string().min(10).max(512),
  platform: z.enum(['ios', 'android', 'web']),
});

/**
 * POST /api/user/push-token
 *
 * Register (or refresh) an Expo push token for the authenticated user.
 * Upserts on the unique token so repeated calls are harmless.
 */
export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'push-token-register', RATE_LIMITS.API_AUTHENTICATED);

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const { token, platform } = parsed.data;

    await prisma.pushToken.upsert({
      where:  { token },
      update: {
        userId, // re-bind if the token migrated to this user (e.g. sign-out/sign-in on the same device)
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
      },
    });

    logger.child({ route: 'POST user/push-token', userId }).info('Push token registered', { platform });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

/**
 * DELETE /api/user/push-token?token=...
 *
 * Remove a specific token (e.g. on sign-out). We scope to the
 * authenticated user so a user can't wipe another user's token.
 */
export async function DELETE(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'push-token-delete', RATE_LIMITS.API_AUTHENTICATED);

    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) throw new HttpError(400, 'token query param is required');

    await prisma.pushToken.deleteMany({
      where: { token, userId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
