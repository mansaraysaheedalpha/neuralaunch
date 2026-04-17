// src/app/api/discovery/ventures/[ventureId]/route.ts
//
// PATCH — rename a venture. Validates ownership via findFirst({ id, userId }).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

const RenameBodySchema = z.object({
  name: z.string().min(1).max(100).transform(v => v.trim()),
});

/**
 * PATCH /api/discovery/ventures/[ventureId]
 *
 * Renames a venture. Accepts { name: string } — non-empty, max 100
 * chars, trimmed. Ownership-scoped via findFirst so a user cannot
 * rename another user's venture.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ventureId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'venture-rename', RATE_LIMITS.API_AUTHENTICATED);

    const { ventureId } = await params;

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = RenameBodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body — name is required (1-100 chars)');

    const venture = await prisma.venture.findFirst({
      where:  { id: ventureId, userId },
      select: { id: true },
    });
    if (!venture) throw new HttpError(404, 'Not found');

    const updated = await prisma.venture.update({
      where: { id: ventureId },
      data:  { name: parsed.data.name },
      select: { id: true, name: true, status: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
