// src/app/build/[pageId]/page.tsx

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
// Import the necessary types from LandingPageBuilder
import LandingPageBuilder, {
  LandingPageData,
  LandingPageFeature,
} from "@/components/landing-page/LandingPageBuilder";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client"; // Import Prisma

interface BuildPageProps {
  params: { pageId: string }; // Params are directly available in Server Components
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
  const { pageId } = params; // No need to await in Server Components

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
    include: {
      emailSignups: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  // Check if page exists AFTER fetching, using the result
  if (!landingPageFromDb) {
    notFound(); // Use notFound if the page doesn't exist or isn't owned by the user
  }

  // --- Fetch Analytics Data ---
  // Use Promise.all to fetch concurrently
  const [totalViews, uniqueVisitorGroups] = await Promise.all([
    prisma.pageView.count({
      where: { landingPageId: landingPageFromDb.id },
    }),
    prisma.pageView.groupBy({
      by: ["sessionId"],
      where: { landingPageId: landingPageFromDb.id },
      _count: { sessionId: true }, // Optimization
    }),
  ]);
  const uniqueVisitors = uniqueVisitorGroups.length;
  // -----------------------------

  // Prepare data for the client component, ensuring types match
  const safeFeatures = parseFeatures(landingPageFromDb.features);
  const landingPageForBuilder: LandingPageData = {
    // Spread all properties from the fetched DB object
    ...landingPageFromDb,
    // Overwrite/ensure specific types
    features: safeFeatures,
    colorScheme: (landingPageFromDb.colorScheme ?? {}) as Prisma.JsonObject,
    // Map signups to match the EmailSignupData interface, converting Date to string
    emailSignups: landingPageFromDb.emailSignups.map((signup) => ({
      id: signup.id,
      email: signup.email,
      name: signup.name, // Prisma handles optional null correctly
      createdAt: signup.createdAt.toISOString(), // Convert Date to ISO string
    })),
  };

  return (
    <LandingPageBuilder
      landingPage={landingPageForBuilder} // Pass the correctly typed data
      analytics={{
        totalViews,
        uniqueVisitors,
        signupCount: landingPageFromDb.emailSignups.length, // Get count from original data
      }}
    />
  );
}

// Generate metadata remains the same
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
