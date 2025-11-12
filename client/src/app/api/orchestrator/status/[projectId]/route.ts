// src/app/api/orchestrator/status/[projectId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { orchestrator } from "@/lib/orchestrator/agent-orchestrator";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import {
  ORCHESTRATOR_PHASES,
  PLANNING_PHASES,
  EXECUTION_PHASES,
  getPhaseMetadata,
  calculatePhaseProgress,
  isPlanningPhase,
  isExecutionPhase,
} from "@/lib/orchestrator/phases";

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

    // 5. Calculate progress percentage using new phase system
    const currentPhase = status.currentPhase;
    const progressPercentage = calculatePhaseProgress(currentPhase);

    // 6. Get current agent metadata
    const phaseMetadata = getPhaseMetadata(currentPhase);
    const currentAgent = phaseMetadata
      ? {
          name: phaseMetadata.name,
          description: phaseMetadata.description,
          icon: phaseMetadata.icon,
          color: phaseMetadata.color,
          category: phaseMetadata.category,
        }
      : {
          name: "Unknown",
          description: "Processing...",
          icon: "⚙️",
          color: "text-gray-500",
          category: "planning" as const,
        };

    // 7. Determine active agents (for execution phase only)
    let activeAgents: string[] = [];
    if (isExecutionPhase(currentPhase)) {
      // Get currently running tasks
      const activeTasks = await prisma.agentTask.findMany({
        where: {
          projectId,
          status: "in_progress",
        },
        select: {
          agentName: true,
        },
        distinct: ["agentName"],
      });
      activeAgents = activeTasks.map((t) => t.agentName);
    }

    // 8. Get current wave number (if in execution)
    let currentWave = 0;
    if (isExecutionPhase(currentPhase)) {
      const latestWave = await prisma.executionWave.findFirst({
        where: {
          projectId,
          status: "in_progress",
        },
        orderBy: {
          waveNumber: "desc",
        },
        select: {
          waveNumber: true,
        },
      });
      currentWave = latestWave?.waveNumber || 0;
    }

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
      isComplete: currentPhase === ORCHESTRATOR_PHASES.COMPLETE,
      isPlanReview: currentPhase === ORCHESTRATOR_PHASES.PLAN_REVIEW,
      isPlanning: isPlanningPhase(currentPhase),
      isExecuting: isExecutionPhase(currentPhase),
      lastUpdated: status.lastUpdated,
      currentAgent,
      activeAgents,
      currentWave,
      phaseDetails: {
        planningPhases: PLANNING_PHASES,
        executionPhases: EXECUTION_PHASES,
        totalPlanning: PLANNING_PHASES.length,
        totalExecution: EXECUTION_PHASES.length,
        completedCount: status.completedPhases.length,
      },
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
    if (projectContext.currentPhase === ORCHESTRATOR_PHASES.COMPLETE) {
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
