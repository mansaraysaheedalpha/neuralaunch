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
    const deployments = await prisma.deployment.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50, // Limit to last 50 deployments
    });

    logger.info("Deployments fetched successfully", {
      projectId,
      count: deployments.length,
    });

    return NextResponse.json({
      deployments: deployments.map((d) => ({
        id: d.id,
        projectId: d.projectId,
        environment: d.environment,
        status: d.status,
        url: d.url,
        platform: d.platform,
        createdAt: d.createdAt,
        deployedAt: d.deployedAt,
        commitMessage: null, // Add if you track commits
        commitHash: null,
        duration: d.deployedAt && d.createdAt
          ? d.deployedAt.getTime() - d.createdAt.getTime()
          : null,
      })),
    });
  } catch (error) {
    logger.error("Failed to fetch deployments", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch deployments" },
      { status: 500 }
    );
  }
}
