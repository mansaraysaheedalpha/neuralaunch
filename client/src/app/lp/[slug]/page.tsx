//client/src/app/lp/[slug]/page.tsx
import { notFound } from "next/navigation";
import LandingPagePublic from "@/components/landing-page/landing-page-public/LandingPagePublic";
import PageViewTracker from "@/components/landing-page/PageViewTracker";
import { Metadata } from "next";
import prisma from "@/lib/prisma";
// Import the type definitions from the Builder to ensure consistency
import type {
  InitialLandingPageData,
  LandingPageFeature,
} from "@/components/landing-page/LandingPageBuilder";
import { getABTestVariant } from "@/lib/ab-testing";

interface PublicLandingPageProps {
  params: { slug: string };
}

// generateMetadata function (Updated siteName)
export async function generateMetadata({
  params,
}: PublicLandingPageProps): Promise<Metadata> {
  const landingPage = await prisma.landingPage.findUnique({
    where: { slug: params.slug, isPublished: true },
  });

  if (!landingPage) {
    return { title: "Page Not Found | NeuraLaunch" }; // Updated name
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL || `https://startupvalidator.app`; // Use your domain

  return {
    title: landingPage.metaTitle || landingPage.title,
    description: landingPage.metaDescription || landingPage.subheadline,
    icons: {
      icon: "/favicon.ico",
      apple: "/apple-touch-icon.png",
    },
    openGraph: {
      title: landingPage.metaTitle || landingPage.title,
      description: landingPage.metaDescription || landingPage.subheadline,
      url: `${siteUrl}/lp/${landingPage.slug}`,
      siteName: "NeuraLaunch", // Updated name
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
    robots: { index: true, follow: true },
  };
}

// Main page component
export default async function PublicLandingPage({
  params,
}: PublicLandingPageProps) {
  // Fetch all the data needed by the LandingPagePublic component
  const landingPage = await prisma.landingPage.findUnique({
    where: { slug: params.slug, isPublished: true },
    select: {
      id: true,
      slug: true,
      isPublished: true,
      conversationId: true,
      title: true,
      headline: true,
      subheadline: true,
      problemStatement: true,
      solutionStatement: true,
      features: true,
      ctaText: true,
      colorScheme: true,
      designVariant: true,
      surveyQuestion1: true,
      surveyQuestion2: true,
      calendlyUrl: true,
      pricingTiers: true,
      abTestVariants: true,
      preorderLink: true,
    },
    // -----------------------
  });

  if (!landingPage) {
    notFound();
  }

  // --- 2. PERFORM A/B TEST LOGIC ---
  // We do this on the server to ensure the client gets a consistent version
  let headline = landingPage.headline ?? "";
  let subheadline = landingPage.subheadline ?? "";
  let ctaText = landingPage.ctaText ?? "Sign Up";

  if (
    landingPage.abTestVariants &&
    typeof landingPage.abTestVariants === "object" &&
    !Array.isArray(landingPage.abTestVariants)
  ) {
    const variants = landingPage.abTestVariants as Record<string, string[]>;
    if (variants.headline && variants.headline.length > 0) {
      headline = getABTestVariant(variants.headline);
    }
    if (variants.subheadline && variants.subheadline.length > 0) {
      subheadline = getABTestVariant(variants.subheadline);
    }
    if (variants.ctaText && variants.ctaText.length > 0) {
      ctaText = getABTestVariant(variants.ctaText);
    }
  }

  // --- Prepare props for the client component ---
  // This structure now correctly matches what LandingPagePublic expects
  const landingPagePropsForClient: InitialLandingPageData & {
    emailSignups: [];
  } = {
    ...landingPage,
    headline: landingPage.headline ?? "",
    subheadline: landingPage.subheadline ?? "",
    ctaText: landingPage.ctaText ?? "Sign Up",
    features: Array.isArray(landingPage.features)
      ? (landingPage.features as unknown as LandingPageFeature[])
      : [],
    colorScheme:
      landingPage.colorScheme as unknown as InitialLandingPageData["colorScheme"], // Convert Prisma JSON safely
    pricingTiers: landingPage.pricingTiers as any,
    pricingTiers: landingPage.pricingTiers as any,
    preorderLink: landingPage.preorderLink,
  };
  // ------------------------------------

  return (
    <>
      <PageViewTracker landingPageSlug={landingPage.slug} />
      {/* Pass the fully-typed props */}
      <LandingPagePublic landingPage={landingPagePropsForClient} />
    </>
  );
}

// generateStaticParams remains the same
export async function generateStaticParams() {
  const publishedPages = await prisma.landingPage.findMany({
    where: { isPublished: true },
    select: { slug: true },
    take: 100,
  });

  return publishedPages.map((page) => ({
    slug: page.slug,
  }));
}

// Revalidate pages every 60 seconds (ISR)
export const revalidate = 60;
