// src/app/api/projects/[projectId]/plan/approve/route.ts
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
import {
  validateGitHubForWave,
  GitHubNotConnectedError,
} from "@/lib/github-connection";

const approveSchema = z.object({
  conversationId: z.string().min(1),
});

/**
 * POST /api/projects/[projectId]/plan/approve
 * User approves the plan and triggers Wave 1 execution
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/plan/approve`,
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
    const rateLimitResult = await checkRateLimit({
      ...RATE_LIMITS.API_AUTHENTICATED,
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
            "X-RateLimit-Limit": RATE_LIMITS.API_AUTHENTICATED.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    // 2. Validate request
    const body: unknown = await req.json();
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("Invalid request", { errors: parsed.error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }
    const validatedBody = parsed.data;

    // 3. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: {
        userId: true,
        currentPhase: true,
        executionPlan: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 4. Check phase
    if (projectContext.currentPhase !== "plan_review") {
      return NextResponse.json(
        {
          error: "Plan is not in review phase",
          currentPhase: projectContext.currentPhase,
        },
        { status: 400 }
      );
    }

    // 5. Check if plan exists
    if (!projectContext.executionPlan) {
      return NextResponse.json(
        { error: "No execution plan found" },
        { status: 400 }
      );
    }

    // 6. Pre-flight check: Validate GitHub connection
    try {
      await validateGitHubForWave(userId);
      logger.info("GitHub connection validated", { userId });
    } catch (error) {
      if (error instanceof GitHubNotConnectedError) {
        logger.warn("GitHub not connected", { userId, projectId });
        return NextResponse.json(
          {
            error: "GitHub account required",
            message:
              "Please connect your GitHub account before approving the plan. Go to your profile settings to connect GitHub.",
            requiresGitHub: true,
            profileUrl: "/profile",
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // 7. Update plan approval status
    await prisma.projectContext.update({
      where: { projectId: projectId },
      data: {
        planApprovalStatus: "approved",
        currentPhase: "wave_execution", // NEW phase
      },
    });

    logger.info("Plan approved, triggering Wave 1", {
      projectId: projectId,
    });

    // 8. Trigger Wave 1 execution via Inngest
    await inngest.send({
      name: "agent/wave.start",
      data: {
        projectId: projectId,
        userId,
        conversationId: validatedBody.conversationId,
        waveNumber: 1,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Plan approved! Wave 1 execution started.",
      waveNumber: 1,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Plan approval error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[projectId]/plan/approve
 * Get current plan approval status
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/plan/approve`,
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
        currentPhase: true,
        planApprovalStatus: true,
        planRevisionCount: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({
      projectId: projectId,
      currentPhase: projectContext.currentPhase,
      approvalStatus: projectContext.planApprovalStatus,
      revisionCount: projectContext.planRevisionCount,
    });
  } catch (error) {
    logger.error("Get approval status error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
