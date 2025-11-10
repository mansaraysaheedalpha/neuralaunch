// src/app/api/orchestrator/status/[projectId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { orchestrator } from "@/lib/orchestrator/agent-orchestrator";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";

/**
 * GET /api/orchestrator/status/[projectId]
 * Get the current status of orchestration for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  
  const logger = createApiLogger({
    path: `/api/orchestrator/status/${projectId}`,
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Verify project exists and user owns it
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId },
      select: {
        userId: true,
        currentPhase: true,
        updatedAt: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Get orchestration status
    const status = await orchestrator.getStatus(projectId);

    // 4. Get execution logs for each phase
    const executions = await prisma.agentExecution.findMany({
      where: { projectId: projectId },
      orderBy: { createdAt: "asc" },
      select: {
        agentName: true,
        phase: true,
        success: true,
        durationMs: true,
        createdAt: true,
        error: true,
      },
    });

    // 5. Calculate progress percentage
    const totalPhases = 4; // analysis, research, validation, planning
    const completedCount = status.completedPhases.length;
    const progressPercentage = Math.round((completedCount / totalPhases) * 100);

    logger.info("Status retrieved", {
      projectId,
      currentPhase: status.currentPhase,
      progress: progressPercentage,
    });

    return NextResponse.json({
      projectId,
      currentPhase: status.currentPhase,
      completedPhases: status.completedPhases,
      progress: progressPercentage,
      isComplete: status.currentPhase === "complete",
      lastUpdated: status.lastUpdated,
      executions: executions.map((e) => ({
        agent: e.agentName,
        phase: e.phase,
        success: e.success,
        duration: e.durationMs,
        timestamp: e.createdAt,
        error: e.error,
      })),
    });
  } catch (error) {
    logger.error("Status endpoint error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orchestrator/status/[projectId]/resume
 * Resume orchestration from current phase
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  
  const logger = createApiLogger({
    path: `/api/orchestrator/status/${projectId}/resume`,
    method: "POST",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Get conversation ID from project
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId },
      select: {
        userId: true,
        conversationId: true,
        currentPhase: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Check if already complete
    if (projectContext.currentPhase === "complete") {
      return NextResponse.json(
        { error: "Orchestration already complete" },
        { status: 400 }
      );
    }

    logger.info("Resuming orchestration", {
      projectId,
      currentPhase: projectContext.currentPhase,
    });

    // 4. Resume orchestration
    const result = await orchestrator.resume(
      projectId,
      userId,
      projectContext.conversationId
    );

    logger.info("Orchestration resumed", {
      projectId,
      success: result.success,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Resume endpoint error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
