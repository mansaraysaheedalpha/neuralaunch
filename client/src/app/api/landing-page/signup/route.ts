// src/app/api/landing-page/signup/route.ts

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Define Zod schema for the request body
const signupRequestSchema = z.object({
  landingPageSlug: z
    .string()
    .min(1, { message: "Missing required field: landingPageSlug" }),
  email: z.string().email({ message: "Invalid email address" }),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limiting for public endpoint
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(null, clientIp);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMITS.PUBLIC,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
            "X-RateLimit-Limit": RATE_LIMITS.PUBLIC.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Body is initially unknown
    const body = await req.json();

    // Validate request body
    const validation = signupRequestSchema.safeParse(body);
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
    const { landingPageSlug, email, name } = validation.data;

    // --- 1. GET THE REFERRAL CODE ---
    const { searchParams } = new URL(req.url);
    const ref = searchParams.get("ref");

    // Find landing page with owner info
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug: landingPageSlug },
      include: {
        user: { select: { email: true, name: true, id: true } },
      },
    });

    // Add null check for landingPage.user
    if (!landingPage?.user) {
      return NextResponse.json(
        {
          success: false,
          message: "Landing page not found or no user associated.",
        },
        { status: 404 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name?.trim() || undefined;

    // Check if email already signed up
    const existing = await prisma.emailSignup.findFirst({
      where: {
        landingPageId: landingPage.id,
        email: cleanEmail,
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "You're already on the list! 🎉",
        alreadySignedUp: true,
        signupId: existing.id,
      });
    }

    // Extract headers from the request object
    const userAgent: string | undefined =
      req.headers.get("user-agent") || undefined;
    const xForwardedFor = req.headers.get("x-forwarded-for");
    const xRealIp = req.headers.get("x-real-ip");
    const ipAddress: string | undefined = xForwardedFor
      ? xForwardedFor.split(",")[0]?.trim()
      : xRealIp || undefined;
    const referrer: string | undefined =
      req.headers.get("referer") || undefined;

    // Create signup in database
    const signup = await prisma.emailSignup.create({
      data: {
        landingPageId: landingPage.id,
        email: cleanEmail,
        name: cleanName,
        source: referrer,
        userAgent,
        ipAddress,
        referredBy: ref || undefined,
      },
    });

    console.log(
      `✅ New signup for ${landingPageSlug}: ${cleanEmail} (ID: ${signup.id})`
    );

    // Handle async emails correctly
    const landingPageUrl = `${env.NEXT_PUBLIC_APP_URL || ""}/lp/${landingPage.slug}`;

    // CRITICAL FIX: Lazy import email functions to avoid build-time initialization
    // This prevents Resend from being initialized during the build process
    const { sendWelcomeEmail, notifyFounderOfSignup } = await import(
      "@/lib/email-service"
    );

    // Fire-and-forget email notifications with better error logging
    void sendWelcomeEmail({
      to: cleanEmail,
      name: cleanName,
      startupName: landingPage.title,
      landingPageUrl: landingPageUrl,
    }).catch((error) => {
      console.error("[WELCOME_EMAIL_ERROR]", error);
    });

    if (landingPage.user.email) {
      void notifyFounderOfSignup({
        founderEmail: landingPage.user.email,
        signupEmail: cleanEmail,
        signupName: cleanName,
        startupName: landingPage.title,
      }).catch((error) => {
        console.error("[FOUNDER_NOTIFICATION_ERROR]", error);
      });
    } else {
      console.warn(`[SIGNUP] No founder email found for landing page: ${landingPage.slug}`);
    }

    // --- 3. CHECK FOR REFERRAL ACHIEVEMENT ---
    // (Skipped for now per instructions)

    return NextResponse.json({
      success: true,
      message: "Thanks for joining! Check your email for confirmation. 🚀",
      signupId: signup.id,
    });
  } catch (error: unknown) {
    console.error("[LANDING_PAGE_SIGNUP]", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
