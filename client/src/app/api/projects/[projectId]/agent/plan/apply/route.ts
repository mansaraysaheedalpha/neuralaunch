// src/app/api/projects/[projectId]/agent/plan/apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { planningAgent } from "@/lib/agents/planning/planning-agent";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";

const applyFeedbackSchema = z.object({
  conversationId: z.string().min(1),
  feedback: z.any(), // Same structure as feedback endpoint
  analysisResult: z.any(), // The analysis result user reviewed
  action: z.enum(["proceed", "revert"]),
});

/**
 * POST /api/projects/[projectId]/plan/apply
 * Apply feedback changes OR revert to original plan
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const logger = createApiLogger({
    path: `/api/projects/${params.projectId}/plan/apply`,
    method: "POST",
  });

  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Validate request
    const body = await req.json();
    const validatedBody = applyFeedbackSchema.parse(body);

    // 3. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: params.projectId },
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
        projectId: params.projectId,
      });

      // Get original plan (before any revisions)
      const originalPlan = await prisma.projectContext.findUnique({
        where: { projectId: params.projectId },
        select: { executionPlan: true },
      });

      return NextResponse.json({
        success: true,
        message: "Reverted to original plan",
        plan: originalPlan?.executionPlan,
      });
    }

    // 5. Apply feedback changes
    logger.info("Applying feedback to plan", { projectId: params.projectId });

    const result = await planningAgent.applyFeedback(
      params.projectId,
      validatedBody.feedback,
      validatedBody.analysisResult
    );

    logger.info("Feedback applied successfully", {
      projectId: params.projectId,
      taskCount: result.plan?.tasks.length,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      plan: result.plan,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.errors });
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
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
