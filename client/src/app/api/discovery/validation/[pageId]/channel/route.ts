// src/app/api/discovery/validation/[pageId]/channel/route.ts
import { NextResponse } from 'next/server';
import { z }           from 'zod';
import prisma          from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

const BodySchema = z.object({
  channel:   z.string().min(1).max(200),
  completed: z.boolean(),
});

/**
 * POST /api/discovery/validation/[pageId]/channel
 *
 * Toggles channel completion state. Ownership enforced via findFirst.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'validation-channel', RATE_LIMITS.API_AUTHENTICATED);

    const { pageId } = await params;

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid body');
    }

    const page = await prisma.validationPage.findFirst({
      where:  { id: pageId, userId },
      select: { id: true, channelsCompleted: true, distributionBrief: true },
    });

    if (!page) throw new HttpError(404, 'Not found');

    // Validate the channel name is one we actually recommended — prevents
    // arbitrary strings bloating the channelsCompleted array.
    const brief = (page.distributionBrief ?? []) as Array<{ channel?: unknown }>;
    const known = new Set(
      brief
        .map(c => (typeof c.channel === 'string' ? c.channel : null))
        .filter((s): s is string => s !== null),
    );
    if (!known.has(parsed.data.channel)) {
      throw new HttpError(400, 'Unknown channel');
    }

    const current = new Set(page.channelsCompleted);
    if (parsed.data.completed) current.add(parsed.data.channel);
    else                        current.delete(parsed.data.channel);

    const updated = await prisma.validationPage.update({
      where:  { id: pageId },
      data:   { channelsCompleted: Array.from(current) },
      select: { channelsCompleted: true },
    });

    return NextResponse.json({ channelsCompleted: updated.channelsCompleted });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
