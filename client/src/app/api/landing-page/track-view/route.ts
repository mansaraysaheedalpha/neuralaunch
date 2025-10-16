// app/api/landing-page/track-view/route.ts
// API endpoint to track page views for analytics

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";//

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
    } = body;

    // Validation
    if (!landingPageSlug || !sessionId) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find landing page
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug: landingPageSlug },
    });

    if (!landingPage) {
      return NextResponse.json(
        { success: false, message: "Landing page not found" },
        { status: 404 }
      );
    }

    // Get visitor info from headers
    const userAgent = req.headers.get("user-agent") || undefined;
    const ipAddress =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      undefined;

    // Create page view record
    await prisma.pageView.create({
      data: {
        landingPageId: landingPage.id,
        sessionId,
        userAgent,
        ipAddress,
        referrer: referrer || undefined,
        utmSource: utmSource || undefined,
        utmMedium: utmMedium || undefined,
        utmCampaign: utmCampaign || undefined,
        timeOnPage: timeOnPage || undefined,
        scrollDepth: scrollDepth || undefined,
        ctaClicked: ctaClicked || false,
      },
    });

    // Update landing page view count (cached)
    await prisma.landingPage.update({
      where: { id: landingPage.id },
      data: {
        views: {
          increment: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Page view tracked",
    });
  } catch (error) {
    console.error("[TRACK_VIEW]", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
