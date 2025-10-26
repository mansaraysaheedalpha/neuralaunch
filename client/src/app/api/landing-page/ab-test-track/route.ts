// src/app/api/landing-page/ab-test-track/route.ts
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { handleApiError, NotFoundError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";

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
      return handleApiError(validation.error, "POST /api/landing-page/ab-test-track");
    }

    const { landingPageSlug, testName, variant, sessionId } = validation.data;

    // Find the landing page
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug: landingPageSlug },
      select: { id: true },
    });

    if (!landingPage) {
      throw new NotFoundError("Landing page");
    }

    // Track the A/B test impression using the feedback table
    await prisma.landingPageFeedback.create({
      data: {
        landingPageId: landingPage.id,
        sessionId,
        feedbackType: `ab_test_${testName}`,
        value: variant,
      },
    });

    return successResponse({ message: "A/B test tracked" }, "A/B test impression tracked successfully");
  } catch (error) {
    return handleApiError(error, "POST /api/landing-page/ab-test-track");
  }
}
