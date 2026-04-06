// src/app/api/discovery/recommendations/[id]/validation-page/route.ts
import { NextResponse }          from 'next/server';
import { auth }                  from '@/auth';
import prisma                    from '@/lib/prisma';
import { logger }                from '@/lib/logger';
import { generateValidationPage } from '@/lib/validation/page-generator';
import type { DiscoveryContext }  from '@/lib/discovery/context-schema';
import type { Roadmap }           from '@/lib/roadmap/roadmap-schema';

/**
 * POST /api/discovery/recommendations/[id]/validation-page
 *
 * Generates (or re-generates) a validation landing page from a recommendation.
 * Requires: recommendation must have a READY roadmap.
 * Returns: { pageId, slug } on success.
 *
 * Idempotent — calling again regenerates content and replaces the existing draft.
 * Cannot regenerate a LIVE page (must archive first).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = session.user.id;

  const { id: recommendationId } = await params;
  const log = logger.child({ route: 'POST validation-page', recommendationId, userId });

  // Load recommendation + roadmap + session belief state
  const recommendation = await prisma.recommendation.findUnique({
    where:  { id: recommendationId, userId },
    select: {
      id:             true,
      path:           true,
      summary:        true,
      validationPage: { select: { id: true, status: true } },
      roadmap:        {
        select: {
          status: true,
          phases: true,
        },
      },
      session: {
        select: {
          audienceType: true,
          beliefState:  true,
        },
      },
    },
  });

  if (!recommendation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (recommendation.roadmap?.status !== 'READY') {
    return NextResponse.json(
      { error: 'Roadmap is not ready yet — generate the roadmap first' },
      { status: 409 },
    );
  }

  // Cannot regenerate a LIVE page
  if (recommendation.validationPage?.status === 'LIVE') {
    return NextResponse.json(
      { error: 'Page is already live — archive it before regenerating' },
      { status: 409 },
    );
  }

  const context      = (recommendation.session?.beliefState ?? {}) as DiscoveryContext;
  const audienceType = (recommendation.session?.audienceType ?? null) as Parameters<typeof generateValidationPage>[0]['audienceType'];
  const roadmap      = { phases: recommendation.roadmap.phases } as Roadmap;

  log.info('Generating validation page');

  const { content, layoutVariant, slug } = await generateValidationPage(
    {
      recommendation: { path: recommendation.path, summary: recommendation.summary } as Parameters<typeof generateValidationPage>[0]['recommendation'],
      context,
      audienceType,
      roadmap,
      sessionId: recommendationId,
    },
    recommendationId,
  );

  // Upsert — replace existing draft if present
  const page = recommendation.validationPage
    ? await prisma.validationPage.update({
        where: { id: recommendation.validationPage.id },
        data:  {
          content:       content as object,
          layoutVariant,
          slug,
          status:        'DRAFT',
          updatedAt:     new Date(),
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
}

// ---------------------------------------------------------------------------
// GET — returns current page status + slug for polling
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { id: recommendationId } = await params;

  const page = await prisma.validationPage.findUnique({
    where:  { recommendationId },
    select: { id: true, slug: true, status: true },
  });

  if (!page) {
    return NextResponse.json({ page: null });
  }

  return NextResponse.json({ page });
}
