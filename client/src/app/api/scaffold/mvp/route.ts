// src/app/api/scaffold/mvp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

// Define Zod schema for the request body
const scaffoldRequestSchema = z.object({
  projectId: z.string().cuid({ message: "Invalid Project ID" }),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Parse request body
    const body: unknown = await req.json();

    // Validate request body
    const validation = scaffoldRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { projectId } = validation.data;

    // Fetch the LandingPage record associated with the projectId and userId
    const landingPage = await prisma.landingPage.findFirst({
      where: {
        id: projectId,
        userId: session.user.id, // Ensure ownership
      },
      select: {
        id: true,
        features: true,
        pricingTiers: true,
      },
    });

    // Check if the landing page exists and is owned by the user
    if (!landingPage) {
      return new NextResponse(
        "Landing page not found or you do not own it",
        { status: 404 }
      );
    }

    // Placeholder response
    return NextResponse.json({
      success: true,
      message: "Blueprint fetched",
    });
  } catch (error: unknown) {
    console.error(
      "[SCAFFOLD_MVP]",
      error instanceof Error ? error.message : error
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
