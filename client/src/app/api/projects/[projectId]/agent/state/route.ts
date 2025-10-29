// src/app/api/projects/[projectId]/agent/state/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  ProjectAgentData,
  StepResult,
  PlanStep,
  ClarificationQuestion,
  AgentStatus,
} from "@/lib/types/agent";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { projectId } = params;

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
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Fetch connected accounts separately
    const accounts = await prisma.account.findMany({
      where: { userId: userId, provider: { in: ["github", "vercel"] } },
      select: {
        provider: true,
        providerAccountId: true,
      },
    });

    // Construct the response object with proper typing
    const agentData: ProjectAgentData = {
      id: project.id,
      title: project.title,
      agentPlan: project.agentPlan as PlanStep[] | null,
      agentClarificationQuestions:
        project.agentClarificationQuestions as ClarificationQuestion[] | null,
      agentUserResponses:
        project.agentUserResponses as Record<string, string> | null,
      agentCurrentStep: project.agentCurrentStep,
      agentStatus: project.agentStatus as AgentStatus | null,
      agentExecutionHistory:
        project.agentExecutionHistory as StepResult[] | null,
      githubRepoUrl: project.githubRepoUrl,
      githubRepoName: project.githubRepoName,
      vercelProjectId: project.vercelProjectId,
      vercelProjectUrl: project.vercelProjectUrl,
      vercelDeploymentUrl: project.vercelDeploymentUrl,
      accounts: accounts,
    };

    return NextResponse.json(agentData);
  } catch (error) {
    logger.error(
      `[Agent State API] Error fetching state for project ${params.projectId}:`,
      error
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
