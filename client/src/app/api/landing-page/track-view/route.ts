// src/app/api/landing-page/track-view/route.ts

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod"; // Import Zod
import { headers } from "next/headers"; // Import headers helper

// Define Zod schema for the expected request body
const trackViewSchema = z.object({
  landingPageSlug: z.string().min(1),
  sessionId: z.string().min(1),
  referrer: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  timeOnPage: z.number().int().positive().optional(),
  scrollDepth: z.number().int().min(0).max(100).optional(),
  ctaClicked: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
     
    const body: unknown = await req.json();

    // Validate request body
    const validation = trackViewSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request body",
          issues: validation.error.format(),
        },
        { status: 400 }
      );
    }
    // Use validated and typed data
    const {
      landingPageSlug,
      sessionId,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
      timeOnPage,
      scrollDepth,
      ctaClicked,
    } = validation.data;

    // Find landing page
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug: landingPageSlug },
      select: { id: true }, // Only select the ID we need
    });

    if (!landingPage) {
      return NextResponse.json(
        { success: false, message: "Landing page not found" },
        { status: 404 }
      );
    }

    // --- FIX: Properly handle headers() return value with type safety ---
    const headersList = await headers();

    // Use type-safe assignments with explicit null handling
    const userAgentHeader = headersList.get("user-agent");
    const userAgentRaw: string | null =
      typeof userAgentHeader === "string" ? userAgentHeader : null;

    const xForwardedFor = headersList.get("x-forwarded-for");
    const xRealIp = headersList.get("x-real-ip");
    const ipAddressRaw: string | null =
      typeof xForwardedFor === "string"
        ? xForwardedFor
        : typeof xRealIp === "string"
          ? xRealIp
          : null;

    const userAgent: string | undefined = userAgentRaw ?? undefined;
    const ipAddress: string | undefined = ipAddressRaw
      ? ipAddressRaw.split(",")[0]?.trim()
      : undefined;
    // ----------------------------

    // Create page view record
    await prisma.pageView.create({
      data: {
        landingPageId: landingPage.id,
        sessionId: sessionId, // Already validated as string
        userAgent: userAgent,
        ipAddress: ipAddress,
        referrer: referrer ?? undefined, // Use nullish coalescing for optional fields
        utmSource: utmSource ?? undefined,
        utmMedium: utmMedium ?? undefined,
        utmCampaign: utmCampaign ?? undefined,
        timeOnPage: timeOnPage ?? undefined,
        scrollDepth: scrollDepth ?? undefined,
        ctaClicked: ctaClicked ?? false, // Default to false if not provided
      },
    });

    // NOTE: Removed the prisma.landingPage.update block for 'views'
    // as 'views' field was not present in the provided schema.
    // If you add a 'views' field later, you can uncomment a similar block.

    return NextResponse.json({
      success: true,
      message: "Page view tracked",
    });
  } catch (error: unknown) {
    // Type catch block
    console.error(
      "[TRACK_VIEW]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
