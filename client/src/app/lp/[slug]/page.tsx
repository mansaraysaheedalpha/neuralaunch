// src/app/lp/[slug]/page.tsx
import { notFound, redirect } from 'next/navigation';
import type { Metadata }      from 'next';
import { auth }               from '@/auth';
import prisma                 from '@/lib/prisma';
import { env }                from '@/lib/env';
import { logger }             from '@/lib/logger';
import { LAYOUT_VARIANTS }    from '@/lib/validation/constants';
import { ValidationPageContentSchema } from '@/lib/validation/schemas';
import {
  ValidationPageProduct,
  ValidationPageService,
  ValidationPageMarketplace,
} from '@/components/validation/public';

// Force dynamic rendering — draft auth and analytics must evaluate on
// every request, not be cached at the edge.
export const dynamic = 'force-dynamic';

interface PublicValidationPageProps {
  params: Promise<{ slug: string }>;
}

// ---------------------------------------------------------------------------
// Metadata — DRAFT pages return generic "Not found" metadata so slug
// enumeration cannot reveal titles/descriptions of unpublished ideas.
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PublicValidationPageProps): Promise<Metadata> {
  const { slug } = await params;

  const page = await prisma.validationPage.findUnique({
    where:  { slug },
    select: { content: true, status: true },
  });

  if (!page || page.status !== 'LIVE') {
    return { title: 'Page Not Found | NeuraLaunch', robots: { index: false, follow: false } };
  }

  const parsed = ValidationPageContentSchema.safeParse(page.content);
  if (!parsed.success) {
    return { title: 'NeuraLaunch', robots: { index: false, follow: false } };
  }

  const content  = parsed.data;
  const siteUrl  = env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? 'https://neuralaunch.app';

  return {
    title:       content.metaTitle,
    description: content.metaDescription,
    openGraph: {
      title:       content.metaTitle,
      description: content.metaDescription,
      url:         `${siteUrl}/lp/${slug}`,
      siteName:    'NeuraLaunch',
      type:        'website',
    },
    twitter: {
      card:        'summary_large_image',
      title:       content.metaTitle,
      description: content.metaDescription,
    },
    robots: { index: true, follow: true },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PublicValidationPage({ params }: PublicValidationPageProps) {
  const { slug } = await params;

  const page = await prisma.validationPage.findUnique({
    where:  { slug },
    select: {
      userId:       true,
      status:       true,
      layoutVariant: true,
      content:      true,
    },
  });

  if (!page || page.status === 'ARCHIVED') notFound();

  // DRAFT pages are only visible to the owning founder
  if (page.status === 'DRAFT') {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== page.userId) {
      redirect('/discovery');
    }
  }

  const parsed = ValidationPageContentSchema.safeParse(page.content);
  if (!parsed.success) {
    logger.error(
      'Malformed ValidationPage content',
      new Error('ValidationPageContentSchema failed to parse'),
      { slug },
    );
    notFound();
  }
  const content = parsed.data;

  if (page.layoutVariant === LAYOUT_VARIANTS.SERVICE) {
    return <ValidationPageService content={content} pageSlug={slug} />;
  }
  if (page.layoutVariant === LAYOUT_VARIANTS.MARKETPLACE) {
    return <ValidationPageMarketplace content={content} pageSlug={slug} />;
  }
  return <ValidationPageProduct content={content} pageSlug={slug} />;
}
