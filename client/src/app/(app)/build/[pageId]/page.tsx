// src/app/build/[pageId]/page.tsx

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
// Import the necessary types from LandingPageBuilder
import LandingPageBuilder, {
  InitialLandingPageData,
  LandingPageFeature,
} from "@/components/landing-page/LandingPageBuilder";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client"; // Import Prisma

interface BuildPageProps {
  params: Promise<{ pageId: string }>; // Params are directly available in Server Components
}

// Corrected parseFeatures function with type predicate and casting
function parseFeatures(features: Prisma.JsonValue): LandingPageFeature[] {
  // Check if it's an array first
  if (!Array.isArray(features)) {
    return [];
  }
  // 1. Filter for items that *look* like LandingPageFeature
  const validItems = features.filter(
    (
      item
    ): item is Prisma.JsonObject => // Check if it's a Prisma JsonObject first
      typeof item === "object" &&
      item !== null &&
      !Array.isArray(item) && // Ensure it's not an array itself
      "title" in item &&
      typeof item.title === "string" &&
      "description" in item &&
      typeof item.description === "string"
    // 'icon' check remains optional
  );
  // 2. Map the valid items and explicitly cast them
  return validItems.map((item) => item as unknown as LandingPageFeature);
}

export default async function BuildPage({ params }: BuildPageProps) {
  const session = await auth();
  const { pageId } = await params; // No need to await in Server Components

  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=/build/${pageId}`);
  }

  // Fetch landing page data including email signups
  const landingPageFromDb = await prisma.landingPage.findUnique({
    where: {
      id: pageId,
      // Ensure user owns the page for security
      userId: session.user.id,
    },
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
      designVariant: true,
      colorScheme: true,
      // emailSignups is no longer needed here, it's fetched by SWR
    },
  });

  // Check if page exists AFTER fetching, using the result
  if (!landingPageFromDb) {
    notFound(); // Use notFound if the page doesn't exist or isn't owned by the user
  }

  // Prepare data for the client component, ensuring types match
  const safeFeatures = parseFeatures(landingPageFromDb.features);
  const landingPageForBuilder: InitialLandingPageData = {
    ...landingPageFromDb,
    features: safeFeatures,
    colorScheme: (landingPageFromDb.colorScheme ?? {}) as Prisma.JsonObject,
    // Ensure all string fields are non-null
    headline: landingPageFromDb.headline ?? "",
    subheadline: landingPageFromDb.subheadline ?? "",
    ctaText: landingPageFromDb.ctaText ?? "Sign Up",
    title: landingPageFromDb.title ?? "Untitled",
  };

  return (
    <LandingPageBuilder
      landingPage={landingPageForBuilder} // Pass only the initial data
    />
  );
}

// Generate metadata remains the same
export async function generateMetadata({ params }: BuildPageProps) {
  const { pageId } = await params;
  const landingPage = await prisma.landingPage.findUnique({
    where: { id: pageId },
    select: { title: true },
  });

  return {
    title: landingPage
      ? `Edit: ${landingPage.title} | NeuraLaunch`
      : "Page Not Found",
  };
}
