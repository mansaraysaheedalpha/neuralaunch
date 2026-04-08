// src/app/api/discovery/sessions/[sessionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { deleteSession } from '@/lib/discovery';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
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
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = authSession.user.id;

  try {
    await rateLimitByUser(userId, 'session-delete', RATE_LIMITS.API_AUTHENTICATED);
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  const { sessionId } = await params;

  const log = logger.child({ route: 'DELETE /api/discovery/sessions/[id]', userId, sessionId });

  try {
    const record = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: { status: true },
    });

    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
  } catch (error) {
    log.error('Session delete failed', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
