import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { executionCoordinator } from "@/lib/orchestrator/execution-coordinator";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

// Extend timeout for execution startup
export const maxDuration = 60;

/**
 * POST /api/projects/[projectId]/execute
 * Start execution of an approved plan
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/execute`,
    method: "POST",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("Unauthorized execution attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Rate limiting - 5 requests per minute for execution
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(userId, clientIp);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMITS.AI_GENERATION,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.success) {
      logger.warn("Rate limit exceeded", { userId, projectId });
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Too many execution requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
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

    logger.info("Execution request received", {
      userId,
      projectId,
    });

    // 2. Verify project exists and user owns it
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId },
      select: {
        userId: true,
        currentPhase: true,
        executionPlan: true,
        conversationId: true,
      },
    });

    if (!projectContext) {
      logger.warn("Project not found", { projectId });
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      logger.warn("Unauthorized project access attempt", {
        projectId,
        userId,
      });
      return NextResponse.json(
        { error: "Unauthorized access to this project" },
        { status: 403 }
      );
    }

    // 3. Check if plan exists
    if (!projectContext.executionPlan) {
      logger.warn("Execution attempted without plan", { projectId });
      return NextResponse.json(
        {
          error: "Cannot execute. No execution plan found.",
        },
        { status: 400 }
      );
    }

    // 4. Check if already executing
    if (
      projectContext.currentPhase === "execution" ||
      projectContext.currentPhase === "executing"
    ) {
      logger.warn("Execution already in progress", { projectId });
      return NextResponse.json(
        {
          error: "Execution already in progress",
          currentPhase: projectContext.currentPhase,
        },
        { status: 400 }
      );
    }

    logger.info("Starting execution", { projectId });

    // 5. Start execution using the execution coordinator
    const result = await executionCoordinator.start({
      projectId,
      userId,
      conversationId: projectContext.conversationId,
      autoStart: true, // Automatically trigger wave 1
    });

    if (!result.success) {
      logger.error("Execution coordination failed", { 
        projectId, 
        error: result.message 
      });
      return NextResponse.json(
        { error: result.message },
        { status: 500 }
      );
    }

    logger.info("Execution triggered successfully", { 
      projectId,
      waveNumber: result.waveNumber,
      tasksTriggered: result.triggeredTasks.length,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      projectId,
      waveNumber: result.waveNumber,
      stats: result.stats,
      executionDashboard: `/projects/${projectId}/execution`,
    });
  } catch (error) {
    logger.error("Execution endpoint error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
