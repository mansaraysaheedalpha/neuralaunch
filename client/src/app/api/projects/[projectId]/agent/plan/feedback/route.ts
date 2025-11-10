// src/app/api/projects/[projectId]/agent/plan/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { planningAgent } from "@/lib/agents/planning/planning-agent";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";

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
            changes: z.record(z.any()).optional(),
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
      techStackChanges: z.record(z.any()).optional(),
    })
    .optional(),
});

/**
 * POST /api/projects/[projectId]/plan/feedback
 * Analyze user feedback and return consequences BEFORE applying changes
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const logger = createApiLogger({
    path: `/api/projects/${params.projectId}/plan/feedback`,
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
    const validatedBody = feedbackSchema.parse(body);

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

    // 4. Check if project is in plan_review phase
    if (projectContext.currentPhase !== "plan_review") {
      return NextResponse.json(
        {
          error: "Plan is not in review phase",
          currentPhase: projectContext.currentPhase,
        },
        { status: 400 }
      );
    }

    // 5. Analyze feedback (this does NOT apply changes yet)
    logger.info("Analyzing feedback", { projectId: params.projectId });

    const analysis = await planningAgent.analyzeFeedback(params.projectId, {
      freeformFeedback: validatedBody.freeformFeedback,
      structuredChanges: validatedBody.structuredChanges,
    });

    logger.info("Feedback analysis complete", {
      projectId: params.projectId,
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
      logger.warn("Invalid request", { errors: error.errors });
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
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
