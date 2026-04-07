// src/app/api/discovery/recommendations/[id]/outcome/route.ts
import { NextResponse } from 'next/server';
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
import { OutcomeSubmissionSchema, OUTCOME_COPY } from '@/lib/outcome/outcome-types';
import type { OutcomeType } from '@/lib/outcome/outcome-types';
import { buildAnonymisedOutcomeRecord } from '@/lib/outcome/anonymise';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';

export const maxDuration = 30;

/**
 * POST /api/discovery/recommendations/[id]/outcome
 *
 * Founder submits an outcome attestation for one of their
 * recommendations. Idempotent — a second POST on the same
 * recommendation returns the existing row instead of creating a new
 * one. The recommendation can have at most one outcome.
 *
 * Hard invariant enforced at the write site:
 *   consentedToTraining=false ⇒ anonymisedRecord=null
 * The invariant lives in code, not in a comment. The anonymised
 * payload is built only inside the consent branch and the variable
 * is null otherwise. There is no code path that builds it without
 * also writing it under the consent branch.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'outcome-submit', RATE_LIMITS.API_AUTHENTICATED);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'POST recommendation-outcome', recommendationId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = OutcomeSubmissionSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');
    const submission = parsed.data;

    // Validate did_not_work has the required free-text — diagnostic
    // not optional. Server-side enforcement of the spec rule.
    const copy = OUTCOME_COPY[submission.outcomeType as OutcomeType];
    if (copy.freeTextRequired && (!submission.freeText || submission.freeText.trim().length === 0)) {
      throw new HttpError(400, 'Free-text answer is required for this outcome type');
    }

    // Load the recommendation + parent context for the anonymised
    // payload. We also load the user's CURRENT consent state and
    // cross-check against what the client sent. Mismatch = either
    // the user changed the toggle in another tab between render and
    // submit, or a malicious client; either way, the server's view
    // wins.
    const [recommendation, user] = await Promise.all([
      prisma.recommendation.findFirst({
        where:  { id: recommendationId, userId },
        select: {
          id:                 true,
          recommendationType: true,
          path:               true,
          summary:            true,
          outcome:            { select: { id: true, outcomeType: true } },
          session: {
            select: {
              audienceType: true,
              beliefState:  true,
            },
          },
        },
      }),
      prisma.user.findUnique({
        where:  { id: userId },
        select: { trainingConsent: true },
      }),
    ]);

    if (!recommendation) throw new HttpError(404, 'Not found');
    if (!user)            throw new HttpError(404, 'User not found');

    // Idempotency: if an outcome already exists, return it. The
    // founder's "submit" click on a recommendation that already has
    // an outcome should not create a duplicate row or replace the
    // first attestation.
    if (recommendation.outcome) {
      log.info('Outcome already exists — returning existing row');
      return NextResponse.json({
        ok:           true,
        alreadyExists: true,
        outcomeId:    recommendation.outcome.id,
      });
    }

    // Cross-check consent. The client sent the value it saw; if it
    // disagrees with the user row, the SERVER's value wins.
    const serverConsent = user.trainingConsent === true;
    const consented = serverConsent && submission.consentedToTraining === true;

    // Build the anonymised payload ONLY in the consent branch. This
    // is the hard invariant: the variable is null whenever consented
    // is false, and there is no other code path that writes
    // anonymisedRecord on this row.
    let anonymisedRecord: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    if (consented) {
      const beliefState = (recommendation.session?.beliefState ?? {}) as unknown as DiscoveryContext;
      anonymisedRecord = buildAnonymisedOutcomeRecord({
        beliefState,
        recommendation: {
          recommendationType: recommendation.recommendationType,
          path:               recommendation.path,
          summary:            recommendation.summary,
          audienceType:       recommendation.session?.audienceType ?? null,
        },
        outcome: {
          outcomeType: submission.outcomeType,
          freeText:    submission.freeText ?? null,
          weakPhases:  submission.weakPhases,
        },
      }) as unknown as Prisma.InputJsonValue;
    } else {
      anonymisedRecord = Prisma.JsonNull;
    }

    const created = await prisma.recommendationOutcome.create({
      data: {
        recommendationId,
        userId,
        outcomeType:         submission.outcomeType,
        freeText:            submission.freeText ?? null,
        weakPhases:          submission.weakPhases,
        consentedToTraining: consented,
        anonymisedRecord,
      },
      select: { id: true, outcomeType: true, submittedAt: true },
    });

    // Clear any pending outcome prompts on associated roadmap progress
    // rows so the trigger does not refire.
    await prisma.roadmapProgress.updateMany({
      where: { roadmap: { recommendationId } },
      data:  {
        outcomePromptPending:   false,
        outcomePromptSkippedAt: null,
      },
    });

    log.info('Outcome submitted', {
      outcomeType: submission.outcomeType,
      consented,
      hasFreeText: !!submission.freeText,
    });

    return NextResponse.json({
      ok:        true,
      outcomeId: created.id,
      consented,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

/**
 * DELETE /api/discovery/recommendations/[id]/outcome
 *
 * Skip the outcome prompt for this recommendation. Used by the
 * three trigger paths when the founder explicitly clicks "skip for
 * now". Sets outcomePromptSkippedAt on every linked RoadmapProgress
 * row so no future trigger surfaces the form for this roadmap.
 *
 * Does NOT create a RecommendationOutcome row. The founder may
 * still submit one later via the recommendation page if they
 * choose to.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'outcome-skip', RATE_LIMITS.API_AUTHENTICATED);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'DELETE recommendation-outcome', recommendationId, userId });

    const rec = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: { id: true },
    });
    if (!rec) throw new HttpError(404, 'Not found');

    await prisma.roadmapProgress.updateMany({
      where: { roadmap: { recommendationId } },
      data:  {
        outcomePromptPending:   false,
        outcomePromptSkippedAt: new Date(),
      },
    });

    log.info('Outcome prompt skipped');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
