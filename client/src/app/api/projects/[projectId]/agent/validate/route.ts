// src/app/api/projects/[projectId]/agent/validate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { validationAgent } from "@/lib/agents/validation/validation.agent";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

// Request validation schema
const validateRequestSchema = z.object({
  conversationId: z.string().min(1, "Conversation ID is required"),
});

/**
 * POST /api/projects/[projectId]/agent/validate
 * Execute validation agent on a project
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/agent/validate`,
    method: "POST",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("Unauthorized validation attempt");
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
    logger.info("Validation request received", {
      userId,
      projectId: projectId,
    });

    // 2. Parse and validate request body
    const body = await req.json();
    const validatedBody = validateRequestSchema.parse(body);

    // 3. Verify project exists and user owns it
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: { userId: true, currentPhase: true },
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

    // 4. Check if prerequisites are met (Analyzer and Research must run first)
    if (projectContext.currentPhase === "analysis") {
      logger.warn("Validation attempted before research phase", {
        projectId: projectId,
      });
      return NextResponse.json(
        {
          error:
            "Cannot validate yet. Please run Analyzer and Research agents first.",
          currentPhase: projectContext.currentPhase,
        },
        { status: 400 }
      );
    }

    // 5. Execute validation agent
    logger.info("Executing validation agent", { projectId: projectId });

    const result = await validationAgent.execute({
      projectId: projectId,
      userId,
      conversationId: validatedBody.conversationId,
    });

    if (!result.success) {
      logger.error("Validation execution failed", new Error(result.message), { projectId: projectId });
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    logger.info("Validation completed successfully", {
      projectId: projectId,
      feasible: result.result?.feasible,
      executionId: result.executionId,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      validation: result.result,
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

    logger.error("Validation endpoint error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[projectId]/agent/validate
 * Get validation status/results for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/agent/validate`,
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Get project context with validation results
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: {
        userId: true,
        currentPhase: true,
        architecture: true,
        updatedAt: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Extract validation from architecture
    const architecture = projectContext.architecture as any;
    const validation = architecture?.validation || null;

    if (!validation) {
      logger.info("No validation results found", {
        projectId: projectId,
      });
      return NextResponse.json({
        hasValidation: false,
        currentPhase: projectContext.currentPhase,
        message: "No validation results available. Run validation first.",
      });
    }

    // 4. Get latest execution log
    const latestExecution = await prisma.agentExecution.findFirst({
      where: {
        projectId: projectId,
        agentName: "ValidationAgent",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        success: true,
        durationMs: true,
        createdAt: true,
      },
    });

    logger.info("Validation results retrieved", {
      projectId: projectId,
      hasValidation: true,
    });

    return NextResponse.json({
      hasValidation: true,
      currentPhase: projectContext.currentPhase,
      validation,
      lastValidated: architecture.validatedAt,
      execution: latestExecution,
    });
  } catch (error) {
    logger.error("Get validation error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
