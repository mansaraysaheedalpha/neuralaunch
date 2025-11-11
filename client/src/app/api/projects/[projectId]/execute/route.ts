import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { inngest } from "@/inngest/client";

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

    // 5. Update phase to execution
    await prisma.projectContext.update({
      where: { projectId },
      data: {
        currentPhase: "execution",
        updatedAt: new Date(),
      },
    });

    logger.info("Starting execution", { projectId });

    // 6. Trigger execution via Inngest
    await inngest.send({
      name: "agent/execution.start",
      data: {
        projectId,
        userId,
        conversationId: projectContext.conversationId,
        plan: projectContext.executionPlan,
      },
    });

    logger.info("Execution triggered successfully", { projectId });

    return NextResponse.json({
      success: true,
      message: "Execution started successfully",
      projectId,
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
