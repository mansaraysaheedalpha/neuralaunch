// src/app/api/discovery/validation/[pageId]/report/route.ts
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
  usedForMvp: z.boolean(),
});

/**
 * POST /api/discovery/validation/[pageId]/report
 *
 * Toggles usedForMvp — the MVP handoff flag.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'validation-report', RATE_LIMITS.API_AUTHENTICATED);

    const { pageId } = await params;

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const page = await prisma.validationPage.findFirst({
      where:  { id: pageId, userId },
      select: { report: { select: { id: true, signalStrength: true } } },
    });

    if (!page?.report) throw new HttpError(404, 'No report on this page yet');

    // Safety: a negative brief cannot be used as an MVP spec. The founder
    // must start a new discovery session instead.
    if (parsed.data.usedForMvp && page.report.signalStrength === 'negative') {
      throw new HttpError(409, 'A negative validation cannot be used as an MVP spec — start a new discovery session instead');
    }

    const updated = await prisma.validationReport.update({
      where:  { id: page.report.id },
      data:   { usedForMvp: parsed.data.usedForMvp },
      select: { usedForMvp: true },
    });

    return NextResponse.json({ usedForMvp: updated.usedForMvp });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
