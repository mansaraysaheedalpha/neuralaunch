// app/build/[pageId]/page.tsx
// Landing page builder/preview page

import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PrismaClient } from "@prisma/client";
import LandingPageBuilder from "@/components/landing-page/LandingPageBuilder";

const prisma = new PrismaClient();

interface BuildPageProps {
  params: Promise<{ pageId: string }>;
}

export default async function BuildPage({ params }: BuildPageProps) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    // Await params to get the value for the redirect URL
    const { pageId } = await params;
    redirect(`/api/auth/signin?callbackUrl=/build/${pageId}`);
  }

   const { pageId } = await params;

  // Get landing page with all related data
  const landingPage = await prisma.landingPage.findUnique({
    where: {
      id: pageId,
    },
    include: {
      conversation: {
        include: {
          tags: true,
        },
      },
      emailSignups: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  // Check if page exists and user owns it
  if (!landingPage || landingPage.userId !== session.user.id) {
    notFound();
  }

  // Get analytics
  const totalViews = await prisma.pageView.count({
    where: { landingPageId: landingPage.id },
  });

  const uniqueVisitors = await prisma.pageView
    .groupBy({
      by: ["sessionId"],
      where: { landingPageId: landingPage.id },
    })
    .then((groups) => groups.length);

  return (
    <LandingPageBuilder
      landingPage={landingPage}
      analytics={{
        totalViews,
        uniqueVisitors,
        signupCount: landingPage.emailSignups.length,
      }}
    />
  );
}

// Generate metadata for the page
export async function generateMetadata({ params }: BuildPageProps) {
  const { pageId } = await params;
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
