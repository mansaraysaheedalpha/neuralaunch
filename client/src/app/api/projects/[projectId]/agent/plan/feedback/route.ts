// src/app/api/projects/[projectId]/agent/plan/feedback/route.ts
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

// Extend timeout for AI analysis operations
export const maxDuration = 300; // 5 minutes

// Request validation schema
const feedbackSchema = z.object({
  conversationId: z.string().min(1),
  freeformFeedback: z.string().optional(),
  structuredChanges: z
    .object({
      taskModifications: z
        .array(
          z.object({
            taskId: z.string(),
            action: z.enum(["modify", "remove", "add"]),
            changes: z.record(z.string(), z.any()).optional(),
          })
        )
        .optional(),
      priorityChanges: z
        .array(
          z.object({
            taskId: z.string(),
            newPriority: z.number().min(1).max(5),
          })
        )
        .optional(),
      techStackChanges: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
});

/**
 * POST /api/projects/[projectId]/plan/feedback
 * Analyze user feedback and return consequences BEFORE applying changes
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/plan/feedback`,
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
    const body = (await req.json()) as unknown;
    const validatedBody = feedbackSchema.parse(body);

    // 3. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: { userId: true, currentPhase: true },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 4. Check if project has a plan (skip phase check to allow feedback from any phase)
    const planData = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: { executionPlan: true },
    });

    if (!planData?.executionPlan) {
      return NextResponse.json(
        {
          error: "No plan found for this project",
        },
        { status: 400 }
      );
    }

    // 5. Analyze feedback (this does NOT apply changes yet)
    logger.info("Analyzing feedback", { projectId: projectId });

    const analysis = await planningAgent.analyzeFeedback(projectId, {
      freeformFeedback: validatedBody.freeformFeedback,
      structuredChanges: validatedBody.structuredChanges,
    });

    logger.info("Feedback analysis complete", {
      projectId: projectId,
      feasible: analysis.feasible,
      warnings: analysis.warnings.length,
      blockers: analysis.blockers.length,
    });

    // 6. Return analysis for user review
    return NextResponse.json({
      success: true,
      analysis,
      message: analysis.feasible
        ? "Changes are feasible. Review consequences below."
        : "Changes have blockers. See recommendations.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Feedback analysis error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
