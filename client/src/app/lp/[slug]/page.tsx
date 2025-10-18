// app/lp/[slug]/page.tsx
// PRODUCTION-READY public landing page with real analytics

import { notFound } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import LandingPagePublic from "@/components/landing-page/LandingPagePublic";
import PageViewTracker from "@/components/landing-page/PageViewTracker";
import { Metadata } from "next";

const prisma = new PrismaClient();

interface PublicLandingPageProps {
  params: {
    slug: string;
  };
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: PublicLandingPageProps): Promise<Metadata> {
  const landingPage = await prisma.landingPage.findUnique({
    where: {
      slug: params.slug,
      isPublished: true,
    },
  });

  if (!landingPage) {
    return {
      title: "Page Not Found | IdeaSpark",
    };
  }

  return {
    title: landingPage.metaTitle || landingPage.title,
    description: landingPage.metaDescription || landingPage.subheadline,
    openGraph: {
      title: landingPage.metaTitle || landingPage.title,
      description: landingPage.metaDescription || landingPage.subheadline,
      url: `https://ideaspark.page/${landingPage.slug}`,
      siteName: "IdeaSpark",
      images: landingPage.ogImage
        ? [
            {
              url: landingPage.ogImage,
              width: 1200,
              height: 630,
              alt: landingPage.title,
            },
          ]
        : [],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: landingPage.metaTitle || landingPage.title,
      description: landingPage.metaDescription || landingPage.subheadline,
      images: landingPage.ogImage ? [landingPage.ogImage] : [],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

// Main page component
export default async function PublicLandingPage({
  params,
}: PublicLandingPageProps) {
  // Get landing page
  const landingPage = await prisma.landingPage.findUnique({
    where: {
      slug: params.slug,
      isPublished: true, // Only show published pages
    },
  });

  // 404 if not found or not published
  if (!landingPage) {
    notFound();
  }

  return (
    <>
      {/* Client-side tracking component */}
      <PageViewTracker landingPageSlug={landingPage.slug} />

      {/* Landing page content */}
      <LandingPagePublic landingPage={landingPage} />
    </>
  );
}

// Optional: Generate static params for pre-rendering published pages
export async function generateStaticParams() {
  const publishedPages = await prisma.landingPage.findMany({
    where: {
      isPublished: true,
    },
    select: {
      slug: true,
    },
    take: 100, // Limit to prevent build timeouts
  });

  return publishedPages.map((page) => ({
    slug: page.slug,
  }));
}

// Revalidate pages every 60 seconds (ISR)
export const revalidate = 60;
