// src/app/api/projects/[projectId]/waves/[waveNumber]/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/inngest/client";
import { githubAgent } from "@/lib/agents/github/github-agent";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";

const approveWaveSchema = z.object({
  conversationId: z.string().min(1),
  mergePR: z.boolean().default(true), // Should we auto-merge the PR?
  continueToNextWave: z.boolean().default(true), // Start next wave?
});

/**
 * POST /api/projects/[projectId]/waves/[waveNumber]/approve
 * User approves wave results and optionally starts next wave
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string; waveNumber: string } }
) {
  const logger = createApiLogger({
    path: `/api/projects/${params.projectId}/waves/${params.waveNumber}/approve`,
    method: "POST",
  });

  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const waveNumber = parseInt(params.waveNumber);

    // 2. Validate request
    const body = await req.json();
    const validatedBody = approveWaveSchema.parse(body);

    // 3. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: params.projectId },
      select: {
        userId: true,
        currentPhase: true,
        codebase: true,
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 4. Verify wave exists and is completed
    const wave = await prisma.executionWave.findUnique({
      where: {
        projectId_waveNumber: {
          projectId: params.projectId,
          waveNumber,
        },
      },
    });

    if (!wave) {
      return NextResponse.json({ error: "Wave not found" }, { status: 404 });
    }

    if (wave.status !== "completed") {
      return NextResponse.json(
        {
          error: "Wave is not completed yet",
          status: wave.status,
        },
        { status: 400 }
      );
    }

    // 5. Get PR info
    const waveTask = await prisma.agentTask.findFirst({
      where: {
        projectId: params.projectId,
        waveNumber,
        prNumber: { not: null },
      },
      select: { prNumber: true, prUrl: true },
    });

    if (!waveTask?.prNumber) {
      return NextResponse.json(
        { error: "No PR found for this wave" },
        { status: 404 }
      );
    }

    // 6. Merge PR if requested
    let mergeResult = null;
    if (validatedBody.mergePR) {
      const codebase = projectContext.codebase as any;
      const repoName = codebase?.githubRepoName;

      if (!repoName) {
        return NextResponse.json(
          { error: "GitHub repository not found" },
          { status: 400 }
        );
      }

      // Get GitHub token
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          accounts: {
            where: { provider: "github" },
            select: { access_token: true },
          },
        },
      });

      const githubToken = user?.accounts[0]?.access_token;

      if (!githubToken) {
        return NextResponse.json(
          { error: "GitHub token not found. Please reconnect GitHub." },
          { status: 400 }
        );
      }

      logger.info("Merging PR", {
        prNumber: waveTask.prNumber,
        waveNumber,
      });

      mergeResult = await githubAgent.mergePullRequest({
        projectId: params.projectId,
        repoName,
        prNumber: waveTask.prNumber,
        githubToken,
        mergeMethod: "squash", // Clean commit history
      });

      if (!mergeResult.success) {
        return NextResponse.json(
          {
            error: "Failed to merge PR",
            details: mergeResult.message,
          },
          { status: 500 }
        );
      }

      // Update task review status
      await prisma.agentTask.updateMany({
        where: {
          projectId: params.projectId,
          waveNumber,
        },
        data: {
          reviewStatus: "merged",
        },
      });

      logger.info("PR merged successfully", {
        prNumber: waveTask.prNumber,
        waveNumber,
      });
    }

    // 7. Check if more waves needed
    const pendingTaskCount = await prisma.agentTask.count({
      where: {
        projectId: params.projectId,
        status: "pending",
        waveNumber: null, // Not yet assigned to a wave
      },
    });

    const hasMoreWaves = pendingTaskCount > 0;

    // 8. Start next wave if requested
    let nextWaveTriggered = false;
    if (validatedBody.continueToNextWave && hasMoreWaves) {
      const nextWaveNumber = waveNumber + 1;

      logger.info("Triggering next wave", { nextWaveNumber });

      await inngest.send({
        name: "agent/wave.start",
        data: {
          projectId: params.projectId,
          userId,
          conversationId: validatedBody.conversationId,
          waveNumber: nextWaveNumber,
        },
      });

      nextWaveTriggered = true;
    }

    // Step 9: Check if this was the last wave
    const pendingCount = await prisma.agentTask.count({
      where: { projectId: params.projectId, status: "pending", waveNumber: null },
    });
    const hasMoreTasks = pendingCount > 0;

    // ✅ If no more waves, trigger deployment
    if (!hasMoreTasks) {
      logger.info(`[Wave Approve] All waves complete! Triggering deployment`);

      // Get deployment platform from project context
      const deployProjectContext = await prisma.projectContext.findUnique({
        where: { projectId: params.projectId },
        select: { architecture: true },
      });

      const architecture = deployProjectContext?.architecture as any;
      const platform =
        architecture?.infrastructureArchitecture?.hosting?.toLowerCase() ||
        "vercel";

      await inngest.send({
        name: "agent/deployment.deploy",
        data: {
          taskId: `deploy-${params.projectId}-production`,
          projectId: params.projectId,
          userId,
          conversationId: validatedBody.conversationId,
          taskInput: {
            platform,
            environment: "production",
            runMigrations: true,
          },
        },
      });

      logger.info(`[Wave Approve] Deployment triggered to ${platform}`);
    }

    return NextResponse.json({
      success: true,
      message: mergeResult?.success
        ? `Wave ${waveNumber} approved and merged!`
        : `Wave ${waveNumber} approved!`,
      waveNumber,
      prMerged: mergeResult?.success || false,
      hasMoreWaves,
      nextWaveTriggered,
      nextWaveNumber: nextWaveTriggered ? waveNumber + 1 : null,
      projectComplete: !hasMoreWaves,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Wave approval error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[projectId]/waves/[waveNumber]/approve
 * Get wave status and approval readiness
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; waveNumber: string } }
) {
  const logger = createApiLogger({
    path: `/api/projects/${params.projectId}/waves/${params.waveNumber}/approve`,
    method: "GET",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const waveNumber = parseInt(params.waveNumber);

    // Get wave info
    const wave = await prisma.executionWave.findUnique({
      where: {
        projectId_waveNumber: {
          projectId: params.projectId,
          waveNumber,
        },
      },
    });

    if (!wave) {
      return NextResponse.json({ error: "Wave not found" }, { status: 404 });
    }

    // Get tasks in this wave
    const tasks = await prisma.agentTask.findMany({
      where: {
        projectId: params.projectId,
        waveNumber,
      },
      select: {
        id: true,
        status: true,
        reviewStatus: true,
        reviewScore: true,
        criticalIssues: true,
        prUrl: true,
        prNumber: true,
      },
    });

    // Check if ready for approval
    const allTasksComplete = tasks.every((t) => t.status === "completed");
    const criticalIssuesFound = tasks.some((t) => (t.criticalIssues || 0) > 0);
    const avgReviewScore =
      tasks.reduce((sum, t) => sum + (t.reviewScore || 0), 0) / tasks.length;

    return NextResponse.json({
      projectId: params.projectId,
      waveNumber,
      status: wave.status,
      readyForApproval: allTasksComplete && wave.status === "completed",
      tasks: {
        total: tasks.length,
        completed: tasks.filter((t) => t.status === "completed").length,
        failed: tasks.filter((t) => t.status === "failed").length,
      },
      quality: {
        averageScore: Math.round(avgReviewScore),
        criticalIssues: tasks.reduce(
          (sum, t) => sum + (t.criticalIssues || 0),
          0
        ),
        hasCriticalIssues: criticalIssuesFound,
      },
      prInfo: tasks[0]?.prUrl
        ? {
            prUrl: tasks[0].prUrl,
            prNumber: tasks[0].prNumber,
          }
        : null,
    });
  } catch (error) {
    logger.error("Get wave status error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}