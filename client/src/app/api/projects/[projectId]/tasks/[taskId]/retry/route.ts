// src/app/api/projects/[projectId]/tasks/[taskId]/retry/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createApiLogger } from "@/lib/logger";
import { inngest } from "@/inngest/client";

/**
 * POST /api/projects/[projectId]/tasks/[taskId]/retry
 *
 * Retry a failed task by resetting its status and triggering the agent again
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const { projectId, taskId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/tasks/${taskId}/retry`,
    method: "POST",
  });

  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Verify project ownership
    const project = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { userId: true, conversationId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Find the task
    const task = await prisma.agentTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        projectId: true,
        agentName: true,
        status: true,
        waveNumber: true,
        input: true,
        error: true,
        retryCount: true,
        priority: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.projectId !== projectId) {
      return NextResponse.json({ error: "Task does not belong to this project" }, { status: 400 });
    }

    // 4. Check if task can be retried (must be failed or escalated)
    if (task.status !== "failed" && task.status !== "escalated") {
      return NextResponse.json(
        { error: `Cannot retry task with status: ${task.status}. Only failed or escalated tasks can be retried.` },
        { status: 400 }
      );
    }

    logger.info(`Retrying task ${taskId}`, {
      agentName: task.agentName,
      status: task.status,
      retryCount: task.retryCount,
    });

    // 5. Reset task status to in_progress and clear error
    await prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status: "in_progress",
        error: undefined,
        startedAt: new Date(),
        completedAt: undefined,
        output: undefined,
        retryCount: (task.retryCount || 0) + 1,
      },
    });

    // 6. Trigger agent execution via Inngest
    // Unified agents: Frontend, Backend, Infrastructure route to unified execution agent
    const UNIFIED_AGENTS = ["FrontendAgent", "BackendAgent", "InfrastructureAgent"];
    const agentTypeMap: Record<string, "frontend" | "backend" | "infrastructure"> = {
      FrontendAgent: "frontend",
      BackendAgent: "backend",
      InfrastructureAgent: "infrastructure",
    };

    if (UNIFIED_AGENTS.includes(task.agentName)) {
      // Use unified execution agent
      await inngest.send({
        name: "agent/execution.unified",
        data: {
          taskId: task.id,
          projectId: task.projectId,
          userId,
          conversationId: project.conversationId || "",
          taskInput: task.input as Record<string, unknown>,
          priority: task.priority || 1,
          waveNumber: task.waveNumber || undefined,
          agentType: agentTypeMap[task.agentName],
          agentName: task.agentName,
        },
      });
    } else if (task.agentName === "DatabaseAgent") {
      // Database agent remains separate
      await inngest.send({
        name: "agent/execution.database",
        data: {
          taskId: task.id,
          projectId: task.projectId,
          userId,
          conversationId: project.conversationId || "",
          taskInput: task.input as Record<string, unknown>,
          priority: task.priority || 1,
          waveNumber: task.waveNumber || undefined,
        },
      });
    } else {
      // Quality agents and others use their specific events
      const eventMap: Record<string, string> = {
        IntegrationAgent: "agent/quality.integration",
        TestingAgent: "agent/quality.testing",
      };

      const eventName = (eventMap[task.agentName] || "agent/execution.generic") as
        | "agent/quality.integration"
        | "agent/quality.testing"
        | "agent/execution.generic";

      await inngest.send({
        name: eventName,
        data: {
          taskId: task.id,
          projectId: task.projectId,
          userId,
          conversationId: project.conversationId || "",
          taskInput: task.input as Record<string, unknown>,
          priority: task.priority || 1,
        },
      });
    }

    logger.info(`Task retry initiated successfully`, {
      taskId,
      agentName: task.agentName,
      retryCount: (task.retryCount || 0) + 1,
    });

    return NextResponse.json({
      success: true,
      message: `Task retry initiated. ${task.agentName} will re-execute the task.`,
      taskId,
      retryCount: (task.retryCount || 0) + 1,
    });
  } catch (error) {
    logger.error("Failed to retry task", error as Error);
    return NextResponse.json(
      { error: "Failed to retry task" },
      { status: 500 }
    );
  }
}
