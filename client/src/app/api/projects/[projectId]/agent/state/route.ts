// src/app/api/projects/[projectId]/agent/state/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { projectAgentDataSchema } from "@/types/agent-schemas";

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
        agentRequiredEnvKeys: true,
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

    // 4. Construct response object - ENSURE ALL FIELDS MATCH SCHEMA
    const rawProjectAgentData = {
      id: project.id,
      title: project.title,
      agentPlan: project.agentPlan ?? null, // Ensure null instead of undefined
      agentClarificationQuestions: project.agentClarificationQuestions ?? null,
      agentUserResponses: project.agentUserResponses ?? null,
      agentCurrentStep: project.agentCurrentStep ?? null,
      agentStatus: project.agentStatus ?? null,
      agentExecutionHistory: project.agentExecutionHistory ?? null,
      githubRepoUrl: project.githubRepoUrl ?? null,
      githubRepoName: project.githubRepoName ?? null,
      vercelProjectId: project.vercelProjectId ?? null,
      vercelProjectUrl: project.vercelProjectUrl ?? null,
      vercelDeploymentUrl: project.vercelDeploymentUrl ?? null,
      agentRequiredEnvKeys: project.agentRequiredEnvKeys ?? null,
      accounts: accounts,
    };

    // 5. Validate the data structure before sending
    const validationResult =
      projectAgentDataSchema.safeParse(rawProjectAgentData);

    if (!validationResult.success) {
      logger.error(
        `[Agent State] Data validation failed for project ${projectId}:`,
        validationResult.error
      );
      logger.error(
        `[Agent State] Raw data that failed validation:`,
        undefined,
        { data: rawProjectAgentData }
      );
      // Return the data anyway but log the issue
      // This helps debug what's wrong
    }

    logger.info(
      `[Agent State] Fetched state for project ${projectId} (status: ${project.agentStatus})`
    );

    // Return the data (validated or not - the client-side validation will handle it)
    return NextResponse.json(rawProjectAgentData, { status: 200 });
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
