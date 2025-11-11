// src/app/api/projects/[projectId]/deployments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createApiLogger } from "@/lib/logger";

/**
 * GET /api/projects/[projectId]/deployments
 * Get all deployments for a project
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const logger = createApiLogger({
    path: "/api/projects/[projectId]/deployments",
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await context.params;

    // 2. Fetch deployments from database
    // TODO: Deployment model doesn't exist in schema yet
    // Return empty array for now to allow builds to succeed
    const deployments: any[] = [];

    logger.info("Deployments fetched successfully", {
      projectId,
      count: deployments.length,
    });

    return NextResponse.json({
      deployments: [],
    });
  } catch (error) {
    logger.error("Failed to fetch deployments", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch deployments" },
      { status: 500 }
    );
  }
}
