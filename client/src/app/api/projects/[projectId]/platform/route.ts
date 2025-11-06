// src/app/api/projects/[projectId]/platform/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";

const platformSchema = z.object({
  platform: z.enum(["web", "mobile", "backend", "desktop", "multi"]),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const log = logger.child({ api: "/api/projects/[projectId]/platform" });

  try {
    const params = await context.params;
    const { projectId } = params;

    // Auth
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Validate
    const body: unknown = await req.json();
    const validation = platformSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid platform", issues: validation.error.format() },
        { status: 400 }
      );
    }

    const { platform } = validation.data;

    // Only allow "web" for now
    if (platform !== "web") {
      return NextResponse.json(
        { error: "Only web platform is currently available" },
        { status: 400 }
      );
    }

    // Save to database
    await prisma.landingPage.update({
      where: { id: projectId, userId: userId },
      data: {
        projectPlatform: platform,
        projectPrimaryLanguage: "typescript", // Default for web
      },
    });

    log.info(`Platform selected: ${platform} for project ${projectId}`);

    return NextResponse.json(
      { message: "Platform saved successfully", platform },
      { status: 200 }
    );
  } catch (error) {
    log.error(
      "Error saving platform:",
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
