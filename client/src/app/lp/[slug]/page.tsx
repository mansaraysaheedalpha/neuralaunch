import { notFound } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import LandingPagePublic from "@/components/landing-page/LandingPagePublic";
import PageViewTracker from "@/components/landing-page/PageViewTracker";
import { Metadata } from "next";

const prisma = new PrismaClient();

// --- ADJUSTED INTERFACE ---
interface PublicLandingPageProps {
  params: Promise<{
    // Expect params as a Promise
    slug: string;
  }>;
  // Keep searchParams optional as before, though not used here
  searchParams?: { [key: string]: string | string[] | undefined };
}
// -------------------------

// Generate metadata for SEO
export async function generateMetadata(
  { params: paramsPromise }: PublicLandingPageProps // Rename prop
): Promise<Metadata> {
  // --- AWAIT PARAMS ---
  const params = await paramsPromise;
  // --------------------
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

  // Use NEXT_PUBLIC_APP_URL for consistency if defined, otherwise fallback
  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL || `https://startupvalidator.app`; // Use your actual domain or env var

  return {
    title: landingPage.metaTitle || landingPage.title,
    description: landingPage.metaDescription || landingPage.subheadline,
    openGraph: {
      title: landingPage.metaTitle || landingPage.title,
      description: landingPage.metaDescription || landingPage.subheadline,
      url: `${siteUrl}/lp/${landingPage.slug}`, // Use dynamic siteUrl
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
export default async function PublicLandingPage(
  { params: paramsPromise }: PublicLandingPageProps // Rename prop
) {
  // --- AWAIT PARAMS ---
  const params = await paramsPromise;
  // --------------------

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
      {/* Ensure LandingPagePublic component expects the resolved landingPage object */}
      <LandingPagePublic landingPage={landingPage} />
    </>
  );
}

// generateStaticParams remains the same
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
