// src/app/api/landing-page/signup/route.ts

import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail, notifyFounderOfSignup } from "@/lib/email-service";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { headers } from "next/headers"; // Correct import for App Router

export const runtime = "nodejs";

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

    // Find landing page with owner info
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug: landingPageSlug },
      include: {
        user: { select: { email: true, name: true } },
      },
    });

    // Add null check for landingPage.user
    if (!landingPage?.user) {
      return NextResponse.json(
        { success: false, message: "Landing page or owner not found" },
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
      });
    }

    // --- FIX: Properly await headers() and handle types ---
    const headersList = await headers();

    // Safely extract headers with proper type checking
    const userAgent: string | undefined =
      headersList.get("user-agent") || undefined;
    const xForwardedFor = headersList.get("x-forwarded-for");
    const xRealIp = headersList.get("x-real-ip");
    const ipAddress: string | undefined = xForwardedFor
      ? xForwardedFor.split(",")[0]?.trim()
      : xRealIp || undefined;
    const referrer: string | undefined =
      headersList.get("referer") || undefined;
    // ----------------------------

    // Create signup in database (removed additionalData)
    const signup = await prisma.emailSignup.create({
      data: {
        landingPageId: landingPage.id,
        email: cleanEmail,
        name: cleanName,
        source: referrer, // Use safely processed referrer
        userAgent, // Use safely processed userAgent
        ipAddress, // Use safely processed ipAddress
      },
    });

    console.log(
      `✅ New signup for ${landingPageSlug}: ${cleanEmail} (ID: ${signup.id})`
    );

    // Handle async emails correctly
    const landingPageUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/lp/${landingPage.slug}`;

    // Explicitly ignore promises for fire-and-forget emails
    void sendWelcomeEmail({
      to: cleanEmail,
      name: cleanName,
      startupName: landingPage.title,
      landingPageUrl,
    }).catch((emailError: unknown) => {
      // Type the catch parameter
      console.error(
        "Failed to send welcome email:",
        emailError instanceof Error ? emailError.message : emailError
      );
    });

    if (landingPage.user.email) {
      void notifyFounderOfSignup({
        founderEmail: landingPage.user.email,
        signupEmail: cleanEmail,
        signupName: cleanName,
        startupName: landingPage.title,
      }).catch((notifyError: unknown) => {
        // Type the catch parameter
        console.error(
          "Failed to notify founder:",
          notifyError instanceof Error ? notifyError.message : notifyError
        );
      });
    }

    return NextResponse.json({
      success: true,
      message: "Thanks for joining! Check your email for confirmation. 🚀",
      signupId: signup.id,
    });
  } catch (error: unknown) {
    // Type the catch parameter
    console.error("[LANDING_PAGE_SIGNUP]", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
