// src/app/api/discovery/sessions/[sessionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { deleteSession } from '@/lib/discovery';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';

/**
 * DELETE /api/discovery/sessions/[sessionId]
 *
 * Discards an incomplete session so the user can start fresh.
 * Marks status EXPIRED in the database and removes from Redis.
 * Only the owning user can delete their own session.
 */
export async function DELETE(
  req:      NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'session-delete', RATE_LIMITS.API_AUTHENTICATED);

    const { sessionId } = await params;
    const log = logger.child({ route: 'DELETE /api/discovery/sessions/[id]', userId, sessionId });

    const record = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: { status: true },
    });

    if (!record) throw new HttpError(404, 'Not found');
    if (record.status !== 'ACTIVE') return NextResponse.json({ ok: true }); // already done

    await Promise.all([
      prisma.discoverySession.update({
        where:  { id: sessionId },
        data:   { status: 'EXPIRED' },
        select: { id: true },
      }),
      deleteSession(sessionId),
    ]);

    log.debug('Session discarded', { sessionId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
