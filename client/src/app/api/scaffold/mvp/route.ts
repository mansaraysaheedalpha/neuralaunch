// src/app/api/scaffold/mvp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { generateMvpCodebase } from "@/lib/services/mvp-generator";
import { PricingTier } from "@/components/landing-page/PricingFeedback";
import JSZip from "jszip";

// Define Zod schema for the request body
const scaffoldRequestSchema = z.object({
  // We're passing the landingPageId from the frontend
  // The route calls it `projectId` but it's the `LandingPage` ID
  projectId: z.string().cuid({ message: "Invalid Landing Page ID" }),
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
    // Rename for clarity. The "project" is the LandingPage
    const { projectId: landingPageId } = validation.data;

    // --- THIS IS THE NEW, CORRECT DATA FETCH ---
    // We need the LandingPage (for pricing) AND the Conversation (for the blueprint)
    const landingPage = await prisma.landingPage.findFirst({
      where: {
        id: landingPageId,
        userId: session.user.id, // Ensure ownership
      },
      include: {
        conversation: {
          include: {
            messages: {
              where: { role: "model" },
              orderBy: { createdAt: "asc" },
              take: 1, // Get the first AI message, which IS the blueprint
            },
          },
        },
      },
    });

    // Check if we have all the data we need
    if (!landingPage) {
      return new NextResponse("Landing page not found or you do not own it", {
        status: 404,
      });
    }

    if (
      !landingPage.conversation ||
      !landingPage.conversation.messages ||
      landingPage.conversation.messages.length === 0
    ) {
      return new NextResponse("Blueprint message not found in conversation", {
        status: 404,
      });
    }

    // This is the REAL blueprint: the raw markdown string
    const blueprintString = landingPage.conversation.messages[0].content;

    // This is the pricing data, which is already in JSON format
    const pricingTiers = landingPage.pricingTiers;

    // --- END NEW DATA FETCH ---

    // Generate MVP codebase files
    // We now pass the correct data. This function is now async!
    const files = await generateMvpCodebase(
      blueprintString,
      pricingTiers as unknown as PricingTier[]
    );

    // Create a zip file
    const zip = new JSZip();

    // Add each file to the zip
    Object.entries(files).forEach(([filepath, content]) => {
      zip.file(filepath, content);
    });

    // Generate the zip file as an ArrayBuffer (compatible with NextResponse)
    const zipArrayBuffer = await zip.generateAsync({ type: "arraybuffer" });

    // Return the zip file
    return new NextResponse(zipArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="mvp-codebase.zip"',
      },
    });
  } catch (error: unknown) {
    console.error(
      "[SCAFFOLD_MVP]",
      error instanceof Error ? error.message : error
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
