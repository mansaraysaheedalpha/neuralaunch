// src/app/api/landing-page/ab-test-track/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

const abTestTrackSchema = z.object({
  landingPageSlug: z.string().min(1),
  testName: z.string().min(1),
  variant: z.string().min(1),
  sessionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const validation = abTestTrackSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { landingPageSlug, testName, variant, sessionId } = validation.data;

    // Find the landing page
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug: landingPageSlug },
      select: { id: true },
    });

    if (!landingPage) {
      return NextResponse.json(
        { error: "Landing page not found" },
        { status: 404 }
      );
    }

    // Track the A/B test impression using the feedback table
    // We use feedbackType as "ab_test_{testName}" and value as the variant
    await prisma.landingPageFeedback.create({
      data: {
        landingPageId: landingPage.id,
        sessionId: sessionId,
        feedbackType: `ab_test_${testName}`,
        value: variant,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AB_TEST_TRACK_ERROR]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
