//src/app/api/landing-page/smoke-test/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

const smokeTestSchema = z.object({
  landingPageSlug: z.string().min(1),
  featureName: z.string().min(1),
  sessionId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const validation = smokeTestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { landingPageSlug, featureName, sessionId } = validation.data;

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

    // Upsert logic: If this session already clicked this feature, increment.
    // Otherwise, create a new record.
    await prisma.featureSmokeTest.upsert({
      where: {
        landingPageId_featureName_sessionId: {
          landingPageId: landingPage.id,
          featureName: featureName,
          sessionId: sessionId || "unknown", // Use 'unknown' if no session
        },
      },
      update: {
        clickCount: {
          increment: 1,
        },
      },
      create: {
        landingPageId: landingPage.id,
        featureName: featureName,
        sessionId: sessionId || "unknown",
        clickCount: 1,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LP_SMOKE_TEST_ERROR]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
