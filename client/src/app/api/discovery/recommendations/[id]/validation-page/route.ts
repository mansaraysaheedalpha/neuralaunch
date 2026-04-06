// src/app/api/discovery/recommendations/[id]/validation-page/route.ts
import { NextResponse } from 'next/server';
import prisma            from '@/lib/prisma';
import { logger }        from '@/lib/logger';
import { generateValidationPage } from '@/lib/validation/page-generator';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import {
  VALIDATION_PAGE_ELIGIBLE_TYPES,
  type AudienceType,
  type RecommendationType,
} from '@/lib/discovery/constants';
import type { Roadmap }          from '@/lib/roadmap/roadmap-schema';

/**
 * POST /api/discovery/recommendations/[id]/validation-page
 *
 * Generates or regenerates a validation landing page from a recommendation.
 * When regenerating, the existing slug is preserved so shared URLs don't
 * break. Rate-limited at the AI_GENERATION tier.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'validation-page-generate', RATE_LIMITS.AI_GENERATION);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'POST validation-page', recommendationId, userId });

    const recommendation = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: {
        id:                 true,
        recommendationType: true,
        path:               true,
        summary:            true,
        validationPage: {
          select: {
            id:     true,
            slug:   true,
            status: true,
            report: { select: { signalStrength: true } },
          },
        },
        roadmap:        { select: { status: true, phases: true } },
        session:        { select: { audienceType: true, beliefState: true } },
      },
    });

    if (!recommendation) {
      throw new HttpError(404, 'Not found');
    }

    // Server-side defense in depth — even if a malicious client posts
    // here directly, the validation page is only generated for action
    // shapes the mechanic actually applies to. Mirrors the UI gating
    // in RecommendationReveal.
    const recType = recommendation.recommendationType as RecommendationType | null;
    if (!recType || !VALIDATION_PAGE_ELIGIBLE_TYPES.has(recType)) {
      throw new HttpError(409, 'A validation landing page is not applicable to this recommendation');
    }

    if (recommendation.validationPage?.report?.signalStrength === 'negative') {
      throw new HttpError(409, 'A negative validation already exists for this recommendation — start a new discovery session instead');
    }

    if (recommendation.roadmap?.status !== 'READY') {
      throw new HttpError(409, 'Roadmap is not ready yet — generate the roadmap first');
    }

    if (recommendation.validationPage?.status === 'LIVE') {
      throw new HttpError(409, 'Page is already live — archive it before regenerating');
    }

    const context      = (recommendation.session?.beliefState ?? {}) as DiscoveryContext;
    const audienceType = (recommendation.session?.audienceType ?? null) as AudienceType | null;
    const roadmap      = { phases: recommendation.roadmap.phases } as Roadmap;

    log.info('Generating validation page');

    const { content, layoutVariant, slug } = await generateValidationPage(
      {
        recommendation: { path: recommendation.path, summary: recommendation.summary },
        context,
        audienceType,
        roadmap,
        existingSlug: recommendation.validationPage?.slug,
        sessionId: recommendationId,
      },
      recommendationId,
    );

    const page = recommendation.validationPage
      ? await prisma.validationPage.update({
          where: { id: recommendation.validationPage.id },
          data:  {
            content:       content as object,
            layoutVariant,
            slug,
            status:        'DRAFT',
          },
          select: { id: true, slug: true },
        })
      : await prisma.validationPage.create({
          data: {
            userId,
            recommendationId,
            slug,
            layoutVariant,
            content: content as object,
            status:  'DRAFT',
          },
          select: { id: true, slug: true },
        });

    log.info('Validation page saved', { pageId: page.id, slug: page.slug });
    return NextResponse.json({ pageId: page.id, slug: page.slug });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    logger.error(
      'Validation-page POST failed',
      err instanceof Error ? err : new Error(String(err)),
    );
    return httpErrorToResponse(err);
  }
}

/**
 * GET /api/discovery/recommendations/[id]/validation-page
 *
 * Returns the existing validation page for this recommendation, scoped to
 * the caller. Returns { page: null } when none exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id: recommendationId } = await params;

    const recommendation = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: {
        validationPage: { select: { id: true, slug: true, status: true } },
      },
    });

    if (!recommendation) {
      throw new HttpError(404, 'Not found');
    }

    return NextResponse.json({ page: recommendation.validationPage ?? null });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    return httpErrorToResponse(err);
  }
}
