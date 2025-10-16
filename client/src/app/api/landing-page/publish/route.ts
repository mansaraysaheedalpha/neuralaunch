// app/api/landing-page/publish/route.ts
// Publish or unpublish a landing page

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "@/lib/prisma";


export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { landingPageId, isPublished } = body;

    if (!landingPageId || typeof isPublished !== "boolean") {
      return new NextResponse("Invalid request", { status: 400 });
    }

    // Update landing page
    const landingPage = await prisma.landingPage.updateMany({
      where: {
        id: landingPageId,
        userId: session.user.id, // Security: ensure user owns page
      },
      data: {
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      },
    });

    if (landingPage.count === 0) {
      return new NextResponse("Landing page not found", { status: 404 });
    }

    return NextResponse.json({
      success: true,
      isPublished,
    });
  } catch (error) {
    console.error("[LANDING_PAGE_PUBLISH]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
