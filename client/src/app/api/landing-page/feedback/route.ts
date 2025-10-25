// src/app/api/landing-page/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

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
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { landingPageSlug, sessionId, feedbackType, value } = validation.data;

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

    await prisma.landingPageFeedback.create({
      data: {
        landingPageId: landingPage.id,
        sessionId: sessionId,
        feedbackType: feedbackType,
        value: value,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LP_FEEDBACK_ERROR]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
