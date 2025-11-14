// src/app/api/projects/[projectId]/deployments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createApiLogger } from "@/lib/logger";
import { toLogContext } from "@/lib/error-utils";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

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

    // Rate limiting
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(session.user.id, clientIp);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMITS.API_READ,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
            "X-RateLimit-Limit": RATE_LIMITS.API_READ.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    const { projectId } = await context.params;

    // 2. Verify project ownership
    const project = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { userId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Get query parameters for filtering
    const searchParams = req.nextUrl.searchParams;
    const environment = searchParams.get("environment"); // "preview" | "staging" | "production"
    const status = searchParams.get("status"); // "pending" | "building" | "deployed" | "failed"
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // 4. Fetch deployments from database
    const deployments = await prisma.deployment.findMany({
      where: {
        projectId,
        ...(environment && { environment }),
        ...(status && { status }),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: offset,
      select: {
        id: true,
        environment: true,
        platform: true,
        deploymentUrl: true,
        status: true,
        buildStatus: true,
        deployedAt: true,
        failedAt: true,
        commitSha: true,
        branch: true,
        waveNumber: true,
        buildDuration: true,
        errorMessage: true,
        deploymentType: true,
        isRollback: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 5. Get total count for pagination
    const totalCount = await prisma.deployment.count({
      where: {
        projectId,
        ...(environment && { environment }),
        ...(status && { status }),
      },
    });

    logger.info("Deployments fetched successfully", {
      projectId,
      count: deployments.length,
      totalCount,
      environment,
      status,
    });

    return NextResponse.json({
      deployments,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + deployments.length < totalCount,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch deployments", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch deployments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[projectId]/deployments
 * Create a new deployment or trigger a deployment
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const logger = createApiLogger({
    path: "/api/projects/[projectId]/deployments",
    method: "POST",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await context.params;

    // 2. Verify project ownership
    const project = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { userId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Parse request body
    const body = await req.json();
    const {
      environment,
      platform,
      branch,
      waveNumber,
      deploymentType = "manual",
    } = body;

    // 4. Validate required fields
    if (!environment || !platform) {
      return NextResponse.json(
        { error: "Missing required fields: environment, platform" },
        { status: 400 }
      );
    }

    // 5. Create deployment record
    const deployment = await prisma.deployment.create({
      data: {
        projectId,
        environment,
        platform,
        branch: branch || "main",
        waveNumber,
        deploymentType,
        triggeredBy: session.user.id,
        status: "pending",
      },
    });

    logger.info("Deployment created", {
      projectId,
      deploymentId: deployment.id,
      environment,
      platform,
    });

    // 6. Trigger deployment via Inngest (if available)
    try {
      const { inngest } = await import("@/inngest/client");

      await inngest.send({
        name: "agent/deployment.deploy",
        data: {
          taskId: `deploy-${deployment.id}`,
          projectId,
          userId: session.user.id,
          conversationId: projectId, // Use projectId as conversationId for now
          environment,
          taskInput: {
            platform,
            environment,
            deploymentId: deployment.id,
            branch: branch || "main",
            waveNumber,
          },
        },
      });

      logger.info("Deployment triggered via Inngest", {
        deploymentId: deployment.id,
      });
    } catch (inngestError) {
      logger.warn("Failed to trigger deployment via Inngest", toLogContext(inngestError));
      // Continue even if Inngest fails - deployment record is created
    }

    return NextResponse.json({
      deployment,
      message: "Deployment initiated successfully",
    }, { status: 201 });
  } catch (error) {
    logger.error("Failed to create deployment", error as Error);
    return NextResponse.json(
      { error: "Failed to create deployment" },
      { status: 500 }
    );
  }
}
