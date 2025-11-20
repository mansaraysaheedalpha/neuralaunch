// src/app/api/projects/[projectId]/agent/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { planningAgent } from "@/lib/agents/planning/planning-agent";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

// Extend timeout for long-running AI operations
// Planning can take 1-3 minutes for Claude API calls
export const maxDuration = 300; // 5 minutes (300 seconds) - max for Pro plan

// Request validation schema
const planRequestSchema = z.object({
  conversationId: z.string().min(1, "Conversation ID is required"),
  options: z
    .object({
      enableDeepDive: z.boolean().optional(),
      useExtendedThinking: z.boolean().optional(),
      useChainOfThought: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /api/projects/[projectId]/agent/plan
 * Execute planning agent on a project
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/agent/plan`,
    method: "POST",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("Unauthorized planning attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Rate limiting - 5 requests per minute for AI planning
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(userId, clientIp);
    const rateLimitResult = await checkRateLimit({
      ...RATE_LIMITS.AI_GENERATION,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.success) {
      logger.warn("Rate limit exceeded", { userId, projectId });
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Too many planning requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
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

    logger.info("Planning request received", {
      userId,
      projectId: projectId,
    });

    // 2. Parse and validate request body
    const body = (await req.json()) as unknown;
    const validatedBody = planRequestSchema.parse(body);

    // 3. Verify project exists and user owns it
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: {
        userId: true,
        currentPhase: true,
        architecture: true,
        blueprint: true,
      },
    });

    if (!projectContext) {
      logger.warn("Project not found", { projectId: projectId });
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      logger.warn("Unauthorized project access attempt", {
        projectId: projectId,
        userId,
      });
      return NextResponse.json(
        { error: "Unauthorized access to this project" },
        { status: 403 }
      );
    }

    // 4. Check if prerequisites are met (Validation must run first)
    if (
      projectContext.currentPhase !== "validation" &&
      projectContext.currentPhase !== "planning"
    ) {
      logger.warn("Planning attempted before validation phase", {
        projectId: projectId,
        currentPhase: projectContext.currentPhase,
      });
      return NextResponse.json(
        {
          error: "Cannot plan yet. Please run Validation Agent first.",
          currentPhase: projectContext.currentPhase,
        },
        { status: 400 }
      );
    }

    // 5. Check if project is feasible
    const architecture = projectContext.architecture as Record<string, unknown> | null;
    const validation = architecture?.validation as Record<string, unknown> | undefined;

    if (!validation || !validation.feasible) {
      logger.warn("Planning attempted on non-feasible project", {
        projectId: projectId,
      });
      return NextResponse.json(
        {
          error:
            "Cannot plan a non-feasible project. Address validation blockers first.",
          validation: validation,
        },
        { status: 400 }
      );
    }

    // 6. Execute planning agent
    logger.info("Executing planning agent", {
      projectId: projectId,
      options: validatedBody.options,
    });

    const blueprint = projectContext.blueprint as string | null;
    if (!blueprint) {
      logger.warn("No blueprint found for planning", { projectId });
      return NextResponse.json(
        { error: "No blueprint available. Please complete analysis and validation first." },
        { status: 400 }
      );
    }

    const result = await planningAgent.execute(
      {
        projectId: projectId,
        userId,
        conversationId: validatedBody.conversationId,
        sourceType: "blueprint",
        blueprint,
      },
      validatedBody.options
    );

    if (!result.success) {
      logger.error("Planning execution failed", new Error(result.message), {
        projectId: projectId,
      });
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    logger.info("Planning completed successfully", {
      projectId: projectId,
      taskCount: result.plan?.tasks.length,
      executionId: result.executionId,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      plan: result.plan,
      executionId: result.executionId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request body", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Planning endpoint error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[projectId]/agent/plan
 * Get planning results for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/agent/plan`,
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Get project context with planning results
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: {
        userId: true,
        currentPhase: true,
        executionPlan: true,
        updatedAt: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Check if plan exists
    if (!projectContext.executionPlan) {
      logger.info("No planning results found", { projectId: projectId });
      return NextResponse.json({
        hasPlan: false,
        currentPhase: projectContext.currentPhase,
        message: "No planning results available. Run planning first.",
      });
    }

    // 4. Get latest execution log
    const latestExecution = await prisma.agentExecution.findFirst({
      where: {
        projectId: projectId,
        agentName: "PlanningAgent",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        success: true,
        durationMs: true,
        createdAt: true,
      },
    });

    // 5. Get task statistics
    const taskStats = await prisma.agentTask.groupBy({
      by: ["status"],
      where: { projectId: projectId },
      _count: true,
    });

    logger.info("Planning results retrieved", {
      projectId: projectId,
      hasPlan: true,
    });

    return NextResponse.json({
      hasPlan: true,
      currentPhase: projectContext.currentPhase,
      plan: projectContext.executionPlan,
      lastPlanned: projectContext.updatedAt,
      execution: latestExecution,
      taskStats: taskStats.reduce(
        (acc, stat) => {
          acc[stat.status] = stat._count;
          return acc;
        },
        {} as Record<string, number>
      ),
    });
  } catch (error) {
    logger.error("Get planning error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
