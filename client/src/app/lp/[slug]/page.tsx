// src/app/lp/[slug]/page.tsx
import { notFound, redirect } from 'next/navigation';
import type { Metadata }      from 'next';
import { auth }               from '@/auth';
import prisma                 from '@/lib/prisma';
import { env }                from '@/lib/env';
import { LAYOUT_VARIANTS }    from '@/lib/validation/constants';
import type { ValidationPageContent } from '@/lib/validation/schemas';
import {
  ValidationPageProduct,
  ValidationPageService,
  ValidationPageMarketplace,
} from '@/components/validation/public';

interface PublicValidationPageProps {
  params: Promise<{ slug: string }>;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PublicValidationPageProps): Promise<Metadata> {
  const { slug } = await params;

  const page = await prisma.validationPage.findUnique({
    where:  { slug },
    select: { content: true, status: true },
  });

  if (!page || page.status === 'ARCHIVED') {
    return { title: 'Page Not Found | NeuraLaunch' };
  }

  const content  = page.content as ValidationPageContent;
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
    robots: page.status === 'LIVE'
      ? { index: true,  follow: true  }
      : { index: false, follow: false },
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

  const content = page.content as ValidationPageContent;

  if (page.layoutVariant === LAYOUT_VARIANTS.SERVICE) {
    return <ValidationPageService  content={content} pageSlug={slug} />;
  }

  if (page.layoutVariant === LAYOUT_VARIANTS.MARKETPLACE) {
    return <ValidationPageMarketplace content={content} pageSlug={slug} />;
  }

  return <ValidationPageProduct content={content} pageSlug={slug} />;
}

// ---------------------------------------------------------------------------
// Static params — only LIVE pages pre-rendered
// ---------------------------------------------------------------------------

export async function generateStaticParams() {
  try {
    const pages = await prisma.validationPage.findMany({
      where:  { status: 'LIVE' },
      select: { slug: true },
      take:   200,
    });
    return pages.map(p => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export const revalidate = 60;
