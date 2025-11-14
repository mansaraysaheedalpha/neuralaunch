// src/app/api/projects/[projectId]/deploy/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/inngest/client";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

const deploySchema = z.object({
  conversationId: z.string().min(1),
  environment: z.enum(["staging", "production"]).default("production"),
  platform: z
    .enum([
      "vercel",
      "railway",
      "render",
      "fly.io",
      "netlify",
      "digitalocean",
      "self-hosted",
    ])
    .optional(),
  customDomain: z.string().optional(),
  runMigrations: z.boolean().default(true),
});

/**
 * POST /api/projects/[projectId]/deploy
 * Trigger deployment for a project
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/deploy`,
    method: "POST",
  });

  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Rate limiting
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(userId, clientIp);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMITS.AI_GENERATION,
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
            "X-RateLimit-Limit": RATE_LIMITS.AI_GENERATION.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    // 2. Validate request
    const body = await req.json();
    const validatedBody = deploySchema.parse(body);

    // 3. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: {
        userId: true,
        currentPhase: true,
        architecture: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 4. Determine deployment platform
    const architecture = projectContext.architecture as any;
    const platform =
      validatedBody.platform ||
      architecture?.infrastructureArchitecture?.hosting?.toLowerCase() ||
      "vercel";

    // 5. Check if project is ready for deployment
    const incompleteTasks = await prisma.agentTask.count({
      where: {
        projectId: projectId,
        status: { in: ["pending", "in_progress", "failed"] },
      },
    });

    if (incompleteTasks > 0 && validatedBody.environment === "production") {
      return NextResponse.json(
        {
          error: "Project has incomplete or failed tasks",
          incompleteTasks,
          suggestion: "Complete all tasks before deploying to production",
        },
        { status: 400 }
      );
    }

    // 6. Trigger Deploy Agent
    logger.info("Triggering Deploy Agent", {
      projectId: projectId,
      platform,
      environment: validatedBody.environment,
    });

    await inngest.send({
      name: "agent/deployment.deploy",
      data: {
        taskId: `deploy-${projectId}-${validatedBody.environment}-${Date.now()}`,
        projectId: projectId,
        userId,
        conversationId: validatedBody.conversationId,
        environment: validatedBody.environment as 'staging' | 'production' | 'preview',
        taskInput: {
          platform,
          environment: validatedBody.environment,
          customDomain: validatedBody.customDomain,
          runMigrations: validatedBody.runMigrations,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Deployment to ${platform} triggered`,
      projectId: projectId,
      platform,
      environment: validatedBody.environment,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Deployment trigger error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[projectId]/deploy
 * Get deployment status and history
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/deploy`,
    method: "GET",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: {
        userId: true,
        codebase: true,
        currentPhase: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const codebase = projectContext.codebase as any;
    const deployments = codebase?.deployments || {};

    return NextResponse.json({
      projectId: projectId,
      currentPhase: projectContext.currentPhase,
      deployments: {
        staging: deployments.staging || null,
        production: deployments.production || null,
      },
      hasActiveDeployment: !!(
        deployments.production?.status === "active" ||
        deployments.staging?.status === "active"
      ),
    });
  } catch (error) {
    logger.error("Get deployment status error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
