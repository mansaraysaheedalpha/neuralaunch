// src/app/api/user/training-consent/route.ts
import { NextResponse } from 'next/server';
import { z }            from 'zod';
import { Prisma }       from '@prisma/client';
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
 * GET /api/user/training-consent
 * Returns the current consent state. Used by the inline opt-in card
 * and the Settings page to render the toggle.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { trainingConsent: true, trainingConsentAt: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    return NextResponse.json({
      consent:   user.trainingConsent,
      consentedAt: user.trainingConsentAt?.toISOString() ?? null,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

/**
 * PATCH /api/user/training-consent
 *
 * Toggle the founder's training-data consent. Two write paths:
 *
 *   true → false (revoke)
 *     We do TWO things:
 *     1. Flip User.trainingConsent to false (so all future outcome
 *        submissions land with consentedToTraining=false).
 *     2. NULL out anonymisedRecord on every existing
 *        RecommendationOutcome of theirs that previously consented.
 *        The fact that they once consented stays on the historical
 *        row (consentedToTraining stays true) but the training
 *        payload is gone. Retroactive deletion is the differentiator
 *        from the lab industry-norm of "future-only opt-out."
 *
 *   false → true (grant)
 *     Set User.trainingConsent=true and User.trainingConsentAt=now.
 *     Existing rows are NOT retroactively backfilled — past outcomes
 *     submitted under the no-consent default stay anonymisedRecord=null.
 *     Only outcomes submitted from this point forward will have a
 *     training payload.
 *
 * Both transitions run inside a single transaction so the consent
 * state and the data state never disagree.
 */
export async function PATCH(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'training-consent', RATE_LIMITS.API_AUTHENTICATED);

    const log = logger.child({ route: 'PATCH user/training-consent', userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const newConsent = parsed.data.consent;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          trainingConsent: newConsent,
          // Stamp the moment of granting so we can re-prompt if the
          // consent copy ever materially changes. Clear on revoke.
          trainingConsentAt: newConsent ? new Date() : null,
        },
        select: { trainingConsent: true, trainingConsentAt: true },
      });

      let purgedRows = 0;
      if (newConsent === false) {
        // Retroactive deletion. Walks every outcome row of the
        // founder where the anonymisedRecord is currently populated
        // and nulls it. The historical consentedToTraining=true
        // value stays — that's the audit fact. Only the payload
        // disappears.
        const purge = await tx.recommendationOutcome.updateMany({
          where: { userId, anonymisedRecord: { not: Prisma.JsonNull } },
          data:  { anonymisedRecord: Prisma.JsonNull },
        });
        purgedRows = purge.count;
      }

      return { updated, purgedRows };
    });

    log.info('Training consent updated', {
      newConsent,
      purgedRows: result.purgedRows,
    });

    return NextResponse.json({
      ok:           true,
      consent:      result.updated.trainingConsent,
      consentedAt:  result.updated.trainingConsentAt?.toISOString() ?? null,
      purgedRecords: result.purgedRows,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
