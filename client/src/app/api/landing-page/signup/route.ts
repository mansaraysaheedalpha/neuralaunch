// app/api/landing-page/signup/route.ts
// PRODUCTION-READY email signup with real email delivery

import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail, notifyFounderOfSignup } from "@/lib/email-service";
import prisma from "@/lib/prisma";//

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { landingPageSlug, email, name, additionalData } = body;

    // Validation
    if (!landingPageSlug || !email) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: "Invalid email address" },
        { status: 400 }
      );
    }

    // Find landing page with owner info
    const landingPage = await prisma.landingPage.findUnique({
      where: { slug: landingPageSlug },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!landingPage) {
      return NextResponse.json(
        { success: false, message: "Landing page not found" },
        { status: 404 }
      );
    }

    // Check if email already signed up
    const existing = await prisma.emailSignup.findFirst({
      where: {
        landingPageId: landingPage.id,
        email: email.toLowerCase().trim(),
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "You're already on the list! 🎉",
        alreadySignedUp: true,
      });
    }

    // Get visitor info from headers
    const userAgent = req.headers.get("user-agent") || undefined;
    const ipAddress =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      undefined;
    const referrer = req.headers.get("referer") || undefined;

    // Create signup in database
    const signup = await prisma.emailSignup.create({
      data: {
        landingPageId: landingPage.id,
        email: email.toLowerCase().trim(),
        name: name?.trim() || undefined,
        additionalData: additionalData || undefined,
        source: referrer,
        userAgent,
        ipAddress,
      },
    });

    console.log(
      `✅ New signup for ${landingPageSlug}: ${email} (ID: ${signup.id})`
    );

    // Send welcome email to subscriber (async, don't wait)
    const landingPageUrl =`${process.env.NEXT_PUBLIC_APP_URL}/lp/${landingPage.slug}`;

    sendWelcomeEmail({
      to: email,
      name: name?.trim(),
      startupName: landingPage.title,
      landingPageUrl,
    }).catch((error) => {
      console.error("Failed to send welcome email:", error);
      // Don't fail the signup if email fails
    });

    // Notify founder of new signup (async, don't wait)
    if (landingPage.user.email) {
      notifyFounderOfSignup({
        founderEmail: landingPage.user.email,
        signupEmail: email,
        signupName: name?.trim(),
        startupName: landingPage.title,
      }).catch((error) => {
        console.error("Failed to notify founder:", error);
        // Don't fail the signup if notification fails
      });
    }

    return NextResponse.json({
      success: true,
      message: "Thanks for joining! Check your email for confirmation. 🚀",
      signupId: signup.id,
    });
  } catch (error) {
    console.error("[LANDING_PAGE_SIGNUP]", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
