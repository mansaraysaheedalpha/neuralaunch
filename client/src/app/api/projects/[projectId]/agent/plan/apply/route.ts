// src/app/api/projects/[projectId]/agent/plan/apply/route.ts
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

// Extend timeout for AI operations
export const maxDuration = 300; // 5 minutes

const feedbackSchema = z.union([
  z.string(),
  z.object({
    type: z.string().optional(),
    content: z.string().optional(),
  }).passthrough(),
]);

const analysisResultSchema = z.object({
  summary: z.string().optional(),
  changes: z.array(z.unknown()).optional(),
}).passthrough();

const applyFeedbackSchema = z.object({
  conversationId: z.string().min(1),
  feedback: feedbackSchema,
  analysisResult: analysisResultSchema,
  action: z.enum(["proceed", "revert"]),
});

/**
 * POST /api/projects/[projectId]/plan/apply
 * Apply feedback changes OR revert to original plan
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/plan/apply`,
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
    const body: unknown = await req.json();
    const validatedBody = applyFeedbackSchema.parse(body);

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

    // 4. Handle revert action
    if (validatedBody.action === "revert") {
      logger.info("Reverting to original plan", {
        projectId: projectId,
      });

      // Get original plan (before any revisions)
      const context = await prisma.projectContext.findUnique({
        where: { projectId: projectId },
        select: { originalPlan: true, executionPlan: true },
      });

      if (!context?.originalPlan) {
        return NextResponse.json(
          { error: "No original plan found to revert to" },
          { status: 404 }
        );
      }

      // Restore original plan
      await prisma.projectContext.update({
        where: { projectId: projectId },
        data: {
          executionPlan: context.originalPlan,
          planRevisionCount: 0,
          planFeedback: undefined,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Reverted to original plan",
        plan: context.originalPlan,
      });
    }

    // 5. Apply feedback changes
    logger.info("Applying feedback to plan", { projectId: projectId });

    // Convert feedback to string if it's an object
    const feedbackString = typeof validatedBody.feedback === 'string'
      ? validatedBody.feedback
      : (validatedBody.feedback as Record<string, unknown>).content
        ? String((validatedBody.feedback as Record<string, unknown>).content)
        : JSON.stringify(validatedBody.feedback);

    const result = await planningAgent.applyFeedback(
      projectId,
      feedbackString,
      validatedBody.analysisResult as Record<string, unknown> | undefined
    );

    logger.info("Feedback applied successfully", {
      projectId: projectId,
      taskCount: result.plan?.tasks.length,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      plan: result.plan,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Apply feedback error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
