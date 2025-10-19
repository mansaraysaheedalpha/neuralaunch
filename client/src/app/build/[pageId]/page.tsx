// app/build/[pageId]/page.tsx
// src/app/build/[pageId]/page.tsx

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
// Import the necessary types from LandingPageBuilder
import LandingPageBuilder, { LandingPageData, LandingPageFeature } from "@/components/landing-page/LandingPageBuilder";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client"; // Import Prisma

interface BuildPageProps {
  params: { pageId: string };
}

// --- FIX: Corrected parseFeatures function ---
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
  // We cast to 'unknown' first, then to the target type for stricter safety
  return validItems.map((item) => item as unknown as LandingPageFeature);
}
// ---------------------------------------------

export default async function BuildPage({ params }: BuildPageProps) {
  const session = await auth();
  const { pageId } = params;

  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=/build/${pageId}`);
  }

  const landingPageFromDb = await prisma.landingPage.findUnique({
    where: { id: pageId },
    include: {
      emailSignups: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!landingPageFromDb || landingPageFromDb.userId !== session.user.id) {
    notFound();
  }

  // Use the corrected parseFeatures function
  const safeFeatures = parseFeatures(landingPageFromDb.features);

  const landingPageForBuilder: LandingPageData = {
      ...landingPageFromDb,
      features: safeFeatures, // Assign the safely parsed features
      colorScheme: (landingPageFromDb.colorScheme ?? {}) as Prisma.JsonObject,
      // Map signups safely, ensuring createdAt is a string
      emailSignups: landingPageFromDb.emailSignups.map(signup => ({
          id: signup.id,
          email: signup.email,
          name: signup.name,
          createdAt: signup.createdAt.toISOString(),
      })),
  };

  // Get analytics (remains the same)
  const totalViews = await prisma.pageView.count({
      where: { landingPageId: landingPageFromDb.id },
  });
  const uniqueVisitors = await prisma.pageView.groupBy({
      by: ["sessionId"],
      where: { landingPageId: landingPageFromDb.id },
  }).then(groups => groups.length);

  return (
    <LandingPageBuilder
      landingPage={landingPageForBuilder}
      analytics={{
        totalViews,
        uniqueVisitors,
        signupCount: landingPageFromDb.emailSignups.length,
      }}
    />
  );
}

// Generate metadata for the page
export async function generateMetadata({ params }: BuildPageProps) {
  const { pageId } = params;
  const landingPage = await prisma.landingPage.findUnique({
    where: { id: pageId },
    select: { title: true },
  });

  return {
    title: landingPage
      ? `Edit: ${landingPage.title} | IdeaSpark`
      : "Page Not Found",
  };
}
