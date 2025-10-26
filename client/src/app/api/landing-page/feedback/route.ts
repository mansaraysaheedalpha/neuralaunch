// src/app/api/landing-page/feedback/route.ts
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { handleApiError, NotFoundError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";

const feedbackSchema = z.object({
  landingPageSlug: z.string().min(1),
  sessionId: z.string().optional(),
  feedbackType: z.string().min(1),
  value: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const validation = feedbackSchema.safeParse(body);

    if (!validation.success) {
      return handleApiError(validation.error, "POST /api/landing-page/feedback");
    }

    const { landingPageSlug, sessionId, feedbackType, value } = validation.data;

    const landingPage = await prisma.landingPage.findUnique({
      where: { slug: landingPageSlug },
      select: { id: true },
    });

    if (!landingPage) {
      throw new NotFoundError("Landing page");
    }

    await prisma.landingPageFeedback.create({
      data: {
        landingPageId: landingPage.id,
        sessionId,
        feedbackType,
        value,
      },
    });

    return successResponse({ message: "Feedback recorded" }, "Feedback recorded successfully");
  } catch (error) {
    return handleApiError(error, "POST /api/landing-page/feedback");
  }
}
