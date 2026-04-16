// src/app/api/user/aggregate-analytics-consent/route.ts
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
  consent: z.boolean(),
});

/**
 * GET /api/user/aggregate-analytics-consent
 * Returns the current aggregate analytics consent state.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { aggregateAnalyticsConsent: true, aggregateAnalyticsConsentAt: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    return NextResponse.json({
      consent:     user.aggregateAnalyticsConsent,
      consentedAt: user.aggregateAnalyticsConsentAt?.toISOString() ?? null,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

/**
 * PATCH /api/user/aggregate-analytics-consent
 *
 * Toggle the founder's aggregate analytics consent.
 *
 *   false -> true (grant)
 *     Sets aggregateAnalyticsConsent=true and stamps the date.
 *     From this point forward the user's data is included in
 *     aggregate computations (completion rates, common blockers,
 *     category distributions).
 *
 *   true -> false (revoke)
 *     Sets aggregateAnalyticsConsent=false and clears the date.
 *     The user is excluded from future aggregate computations.
 *     NO retroactive deletion — aggregated counts cannot be
 *     "unglued" from a specific user. This is stated clearly in
 *     the UI disclosure.
 */
export async function PATCH(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'aggregate-analytics-consent', RATE_LIMITS.API_AUTHENTICATED);

    const log = logger.child({ route: 'PATCH user/aggregate-analytics-consent', userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const newConsent = parsed.data.consent;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        aggregateAnalyticsConsent:   newConsent,
        aggregateAnalyticsConsentAt: newConsent ? new Date() : null,
      },
      select: { aggregateAnalyticsConsent: true, aggregateAnalyticsConsentAt: true },
    });

    log.info('Aggregate analytics consent updated', { newConsent });

    return NextResponse.json({
      ok:          true,
      consent:     updated.aggregateAnalyticsConsent,
      consentedAt: updated.aggregateAnalyticsConsentAt?.toISOString() ?? null,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
