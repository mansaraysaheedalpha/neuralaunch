// src/app/api/user/push-preferences/route.ts
//
// Master toggle for push notifications. When false, we still keep
// the user's device tokens (so re-enabling is instant) but
// sendPushToUser() short-circuits.

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
  nudgesEnabled: z.boolean(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { nudgesEnabled: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    return NextResponse.json({ nudgesEnabled: user.nudgesEnabled });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'push-preferences', RATE_LIMITS.API_AUTHENTICATED);

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    await prisma.user.update({
      where: { id: userId },
      data:  { nudgesEnabled: parsed.data.nudgesEnabled },
    });

    logger.child({ route: 'PATCH user/push-preferences', userId }).info('Push preferences updated', { nudgesEnabled: parsed.data.nudgesEnabled });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
