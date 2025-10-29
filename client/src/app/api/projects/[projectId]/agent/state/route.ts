// src/app/api/projects/[projectId]/agent/state/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/projects/[projectId]/agent/state
 * 
 * Fetches the complete state of the agent builder for a specific project,
 * including plan, questions, responses, execution history, and connected accounts.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const params = await context.params;
    // 1. Authentication & Authorization
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { projectId } = params;

    // 2. Fetch project data with all agent-related fields
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: {
        id: true,
        title: true,
        agentPlan: true,
        agentClarificationQuestions: true,
        agentUserResponses: true,
        agentCurrentStep: true,
        agentStatus: true,
        agentExecutionHistory: true,
        githubRepoUrl: true,
        githubRepoName: true,
        vercelProjectId: true,
        vercelProjectUrl: true,
        vercelDeploymentUrl: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }

    // 3. Fetch user's connected accounts
    const accounts = await prisma.account.findMany({
      where: { userId: userId },
      select: {
        provider: true,
        providerAccountId: true,
      },
    });

    // 4. Construct response object
    const projectAgentData = {
      id: project.id,
      title: project.title,
      agentPlan: project.agentPlan,
      agentClarificationQuestions: project.agentClarificationQuestions,
      agentUserResponses: project.agentUserResponses,
      agentCurrentStep: project.agentCurrentStep,
      agentStatus: project.agentStatus,
      agentExecutionHistory: project.agentExecutionHistory,
      githubRepoUrl: project.githubRepoUrl,
      githubRepoName: project.githubRepoName,
      vercelProjectId: project.vercelProjectId,
      vercelProjectUrl: project.vercelProjectUrl,
      vercelDeploymentUrl: project.vercelDeploymentUrl,
      accounts: accounts,
    };

    logger.info(
      `[Agent State] Fetched state for project ${projectId} (status: ${project.agentStatus})`
    );

    return NextResponse.json(projectAgentData, { status: 200 });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      `[Agent State API] Error: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
