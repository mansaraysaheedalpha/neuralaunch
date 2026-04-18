// src/app/api/discovery/validation/[pageId]/publish/route.ts
import { NextResponse }           from 'next/server';
import prisma                     from '@/lib/prisma';
import { logger }                 from '@/lib/logger';
import { generateDistributionBrief } from '@/lib/validation/distribution-generator';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import type { AudienceType }     from '@/lib/discovery/constants';
import { env }                   from '@/lib/env';
import { requireTierOrThrow }    from '@/lib/auth/require-tier';

/**
 * POST /api/discovery/validation/[pageId]/publish
 *
 * Transitions a DRAFT page to LIVE and generates the distribution brief.
 * Rate-limited at AI_GENERATION tier. Wraps the DB update + brief creation
 * in a transaction so the page cannot land LIVE without a brief attached.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'compound');
    await rateLimitByUser(userId, 'validation-publish', RATE_LIMITS.AI_GENERATION);

    const { pageId } = await params;
    const log = logger.child({ route: 'POST validation/publish', pageId, userId });

    const page = await prisma.validationPage.findFirst({
      where:  { id: pageId, userId },
      select: {
        id:               true,
        slug:             true,
        status:           true,
        recommendationId: true,
        recommendation: {
          select: {
            path:    true,
            summary: true,
            session: {
              select: {
                audienceType: true,
                beliefState:  true,
              },
            },
          },
        },
      },
    });

    if (!page) throw new HttpError(404, 'Not found');
    if (page.status !== 'DRAFT') {
      throw new HttpError(409, `Page is already ${page.status.toLowerCase()}`);
    }
    if (!page.recommendation) {
      throw new HttpError(409, 'Page is missing its recommendation context');
    }

    const siteUrl  = env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? 'https://neuralaunch.app';
    const pageUrl  = `${siteUrl}/lp/${page.slug}`;

    const context      = (page.recommendation.session?.beliefState ?? {}) as DiscoveryContext;
    const audienceType = (page.recommendation.session?.audienceType ?? null) as AudienceType | null;

    log.info('Generating distribution brief', { pageId, slug: page.slug });

    const distributionBrief = await generateDistributionBrief(
      { path: page.recommendation.path, summary: page.recommendation.summary },
      context,
      audienceType,
      pageUrl,
      pageId,
    );

    const updated = await prisma.validationPage.update({
      where: { id: pageId },
      data:  {
        status:            'LIVE',
        publishedAt:       new Date(),
        distributionBrief: distributionBrief as object[],
      },
      select: { slug: true },
    });

    log.info('Validation page published', { pageId, slug: updated.slug });
    return NextResponse.json({ slug: updated.slug, pageUrl, distributionBrief });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    logger.error(
      'Publish failed',
      err instanceof Error ? err : new Error(String(err)),
    );
    return httpErrorToResponse(err);
  }
}
