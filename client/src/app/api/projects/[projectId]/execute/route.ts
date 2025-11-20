import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";
import {
  validateGitHubForWave,
  GitHubNotConnectedError,
} from "@/lib/github-connection";

// Extend timeout for execution startup
export const maxDuration = 60;

/**
 * POST /api/projects/[projectId]/execute
 * Start execution of an approved plan.
 * Now uses the relational schema to efficiently check existing waves.
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

    // 2. Rate limiting
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
          message: `Too many execution requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
        },
        { status: 429 }
      );
    }

    logger.info("Execution request received", { userId, projectId });

    // 3. Fetch Project, Plan, AND Last Wave in ONE query
    // ✅ This now works because of your migration!
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId },
      include: {
        // Fetch the most recent wave to calculate the next step
        executionWaves: {
          orderBy: { waveNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized access to this project" },
        { status: 403 }
      );
    }

    // 4. Validate Execution Plan
    if (!projectContext.executionPlan) {
      return NextResponse.json(
        { error: "Cannot execute. No execution plan found." },
        { status: 400 }
      );
    }

    // 5. Safety Check for Conversation ID
    if (!projectContext.conversationId) {
      logger.error("Missing conversationId for execution", undefined, {
        projectId,
      });
      return NextResponse.json(
        {
          error: "Configuration Error",
          message:
            "Missing conversation context. Please re-run the planning agent.",
        },
        { status: 400 }
      );
    }

    // 6. Calculate Next Wave Number
    // We check the executionWaves array (which will have 0 or 1 items)
    const lastWave = projectContext.executionWaves[0];
    const lastWaveNumber = lastWave?.waveNumber || 0;
    const nextWaveNumber = lastWaveNumber + 1;

    // 7. Check if Project is already finished
    const executionPlan = projectContext.executionPlan as { plan?: { phases?: unknown[] } } | null;
    const planPhases = executionPlan?.plan?.phases || [];
    const totalPhases = planPhases.length;

    if (totalPhases > 0 && nextWaveNumber > totalPhases) {
      return NextResponse.json(
        {
          error: "Project Complete",
          message: "All planned phases have already been executed.",
        },
        { status: 400 }
      );
    }

    // 8. Check if ALREADY executing
    // If the last wave exists and failed, we allow a retry (proceed).
    // If the last wave is still in progress, we stop.
    if (
      (projectContext.currentPhase === "execution" ||
        projectContext.currentPhase === "executing") &&
      lastWave?.status !== "failed"
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

    // 9. Pre-flight check: Validate GitHub connection
    try {
      await validateGitHubForWave(userId);
    } catch (error) {
      if (error instanceof GitHubNotConnectedError) {
        return NextResponse.json(
          {
            error: "GitHub account required",
            message:
              "Please connect your GitHub account before starting execution.",
            requiresGitHub: true,
            profileUrl: "/profile",
          },
          { status: 400 }
        );
      }
      throw error;
    }

    logger.info(`Starting execution for Wave ${nextWaveNumber}`, { projectId });

    // 10. Trigger Wave Start via Inngest
    await inngest.send({
      name: "agent/wave.start",
      data: {
        projectId,
        userId,
        conversationId: projectContext.conversationId,
        waveNumber: nextWaveNumber,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Wave ${nextWaveNumber} execution started successfully.`,
      projectId,
      waveNumber: nextWaveNumber,
      executionDashboard: `/projects/${projectId}/execution`,
    });
  } catch (error) {
    logger.error("Execution endpoint error", error as Error, {
      projectId: (await params).projectId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
