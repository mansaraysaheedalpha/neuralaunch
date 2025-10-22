import { notFound } from "next/navigation";
// No need for Prisma type imports here if not used for casting
import LandingPagePublic from "@/components/landing-page/LandingPagePublic";
import PageViewTracker from "@/components/landing-page/PageViewTracker";
import { Metadata } from "next";
import prisma from "@/lib/prisma"; // Use shared client instance

// Keep adjusted interface for props passed by Next.js
interface PublicLandingPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

// generateMetadata function remains the same
export async function generateMetadata({
  params: paramsPromise,
}: PublicLandingPageProps): Promise<Metadata> {
  const params = await paramsPromise;
  const landingPage = await prisma.landingPage.findUnique({
    where: { slug: params.slug, isPublished: true },
  });

  if (!landingPage) {
    return { title: "Page Not Found | IdeaSpark" };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL || `https://startupvalidator.app`;

  return {
    title: landingPage.metaTitle || landingPage.title,
    description: landingPage.metaDescription || landingPage.subheadline,
    icons: {
      icon: "/favicon.ico",
      apple: "/apple-touch-icon.png", // Use real or fallback
    },
    openGraph: {
      title: landingPage.metaTitle || landingPage.title,
      description: landingPage.metaDescription || landingPage.subheadline,
      url: `${siteUrl}/lp/${landingPage.slug}`,
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
    robots: { index: true, follow: true },
  };
}

// Main page component
export default async function PublicLandingPage({
  params: paramsPromise,
}: PublicLandingPageProps) {
  const params = await paramsPromise;

  // Fetch the necessary data for the LandingPagePublic component
  const landingPage = await prisma.landingPage.findUnique({
    where: { slug: params.slug, isPublished: true },
    // Select only the fields needed by LandingPagePublic to minimize data transfer
    select: {
      id: true,
      slug: true,
      headline: true,
      subheadline: true,
      problemStatement: true,
      solutionStatement: true,
      features: true, // Let Prisma pass the JSON value directly
      ctaText: true,
      colorScheme: true, // Let Prisma pass the JSON value directly
      // Select other fields ONLY if LandingPagePublic uses them
    },
  });

  if (!landingPage) {
    notFound();
  }

  // --- Pass the fetched data directly ---
  // The structure fetched by Prisma now matches what LandingPagePublic expects
  // (where features and colorScheme might be JsonValue, handled by 'unknown' + casting in the client component)
  const landingPagePropsForClient = {
    ...landingPage,
    // Ensure nulls are handled if component expects non-null strings
    headline: landingPage.headline ?? "",
    subheadline: landingPage.subheadline ?? "",
    ctaText: landingPage.ctaText ?? "Sign Up",
    // features and colorScheme are passed as fetched (Prisma.JsonValue)
    // which aligns with 'unknown' in the client component's props.
  };
  // ------------------------------------

  return (
    <>
      <PageViewTracker landingPageSlug={landingPage.slug} />
      {/* Pass the prepared props */}
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
