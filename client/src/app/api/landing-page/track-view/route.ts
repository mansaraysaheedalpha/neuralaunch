// src/app/api/landing-page/track-view/route.ts

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { headers } from "next/headers";
import { handleApiError, NotFoundError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";

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
      return handleApiError(validation.error, "POST /api/landing-page/track-view");
    }

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
      select: { id: true },
    });

    if (!landingPage) {
      throw new NotFoundError("Landing page");
    }

    // Get headers with type safety
    const headersList = await headers();
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

    // Create page view record
    await prisma.pageView.create({
      data: {
        landingPageId: landingPage.id,
        sessionId,
        userAgent,
        ipAddress,
        referrer: referrer ?? undefined,
        utmSource: utmSource ?? undefined,
        utmMedium: utmMedium ?? undefined,
        utmCampaign: utmCampaign ?? undefined,
        timeOnPage: timeOnPage ?? undefined,
        scrollDepth: scrollDepth ?? undefined,
        ctaClicked: ctaClicked ?? false,
      },
    });

    return successResponse(
      { message: "Page view tracked" },
      "Page view tracked successfully"
    );
  } catch (error: unknown) {
    return handleApiError(error, "POST /api/landing-page/track-view");
  }
}
