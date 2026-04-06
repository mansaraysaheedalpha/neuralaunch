// src/app/api/discovery/validation/[pageId]/publish/route.ts
import { NextResponse }           from 'next/server';
import { auth }                   from '@/auth';
import prisma                     from '@/lib/prisma';
import { logger }                 from '@/lib/logger';
import { generateDistributionBrief } from '@/lib/validation/distribution-generator';
import type { DiscoveryContext }  from '@/lib/discovery/context-schema';
import type { Recommendation }    from '@/lib/discovery/recommendation-schema';
import { env }                    from '@/lib/env';

/**
 * POST /api/discovery/validation/[pageId]/publish
 *
 * Transitions a DRAFT ValidationPage to LIVE.
 * At publish time, also generates the distribution brief (3 specific channels
 * with exact message copy) and persists it on the page record.
 *
 * Returns: { slug, pageUrl, distributionBrief } on success.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = session.user.id;

  const { pageId } = await params;
  const log = logger.child({ route: 'POST validation/publish', pageId, userId });

  const page = await prisma.validationPage.findUnique({
    where:  { id: pageId, userId },
    select: {
      id:             true,
      slug:           true,
      status:         true,
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

  if (!page) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (page.status !== 'DRAFT') {
    return NextResponse.json(
      { error: `Page is already ${page.status.toLowerCase()}` },
      { status: 409 },
    );
  }

  const siteUrl  = env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? 'https://neuralaunch.app';
  const pageUrl  = `${siteUrl}/lp/${page.slug}`;

  const recommendation = page.recommendation as unknown as Recommendation;
  const context        = (page.recommendation?.session?.beliefState ?? {}) as DiscoveryContext;
  const audienceType   = (page.recommendation?.session?.audienceType ?? null) as Parameters<typeof generateDistributionBrief>[2];

  log.info('Generating distribution brief', { pageId, slug: page.slug });

  const distributionBrief = await generateDistributionBrief(
    recommendation,
    context,
    audienceType,
    pageUrl,
    pageId,
  );

  const updated = await prisma.validationPage.update({
    where: { id: pageId },
    data:  {
      status:           'LIVE',
      publishedAt:      new Date(),
      distributionBrief: distributionBrief as object[],
    },
    select: { slug: true },
  });

  log.info('Validation page published', { pageId, slug: updated.slug });

  return NextResponse.json({ slug: updated.slug, pageUrl, distributionBrief });
}
