// src/app/api/landing-page/publish/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod"; // Import Zod

// Define Zod schema for the request body
const publishRequestSchema = z.object({
  landingPageId: z.string().cuid({ message: "Invalid Landing Page ID" }),
  isPublished: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // --- FIX: Handle req.json() safely ---
    const body: unknown = await req.json();
    // ------------------------------------

    // Validate request body
    const validation = publishRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { landingPageId, isPublished } = validation.data;

    // --- FIX: Correctly handle updateMany result ---
    // updateMany returns an object { count: number }
    const updateResult = await prisma.landingPage.updateMany({
      where: {
        id: landingPageId,
        userId: session.user.id, // Security check
      },
      data: {
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      },
    });

    // Check if any record was actually updated
    if (updateResult.count === 0) {
      return new NextResponse("Landing page not found or you do not own it", {
        status: 404,
      });
    }
    // -------------------------------------------

    return NextResponse.json({
      success: true,
      isPublished,
    });
  } catch (error: unknown) {
    // Type catch block
    console.error(
      "[LANDING_PAGE_PUBLISH]",
      error instanceof Error ? error.message : error
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
