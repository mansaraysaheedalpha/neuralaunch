// src/app/api/projects/[projectId]/agent/execute/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { inngest } from "@/inngest/client"; // Import Inngest client
import type { PlanStep, StepResult } from "@/types/agent"; // Keep types for fetching data

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const params = await context.params;
  const { projectId } = params;
  const log = logger.child({
    api: `/api/projects/${projectId}/agent/execute`,
    projectId,
  });

  try {
    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized request.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. --- Fetch Project State Needed to Send Event ---
    const projectData = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: {
        agentPlan: true,
        agentCurrentStep: true,
        agentStatus: true,
        agentUserResponses: true,
        agentExecutionHistory: true, // Needed for history length
        githubRepoUrl: true,
        conversation: {
          include: {
            messages: {
              where: { role: "assistant" },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!projectData) {
      log.warn("Project not found or forbidden.");
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }

    const plan = projectData.agentPlan as PlanStep[] | null;
    const currentStep = projectData.agentCurrentStep ?? 0;
    const currentHistory =
      (projectData.agentExecutionHistory as StepResult[] | null) || [];

    // 3. --- Plan Completion Check (before Status Narrowing) ---
    if (!plan || currentStep >= plan.length) {
      log.warn("Attempted to execute beyond end of plan.");
      if (projectData.agentStatus !== "COMPLETE") {
        await prisma.landingPage.update({
          where: { id: projectId },
          data: { agentStatus: "COMPLETE" },
        });
      }
      return NextResponse.json(
        {
          status: "complete",
          message: "All steps already complete.",
          agentStatus: "COMPLETE",
        },
        { status: 200 }
      );
    }

    // 3b. --- Status Check ---
    if (
      projectData.agentStatus !== "READY_TO_EXECUTE" &&
      projectData.agentStatus !== "PAUSED_AFTER_STEP" &&
      projectData.agentStatus !== "PAUSED_FOR_PREVIEW" &&
      projectData.agentStatus !== "ERROR"
    ) {
      log.warn(
        `Agent cannot execute in current status: ${projectData.agentStatus}`
      );
      return NextResponse.json(
        {
          error: `Agent cannot execute in current status: ${projectData.agentStatus}`,
        },
        { status: 400 }
      );
    }

    const currentTask = plan[currentStep];
    const blueprintSummary =
      projectData.conversation?.messages?.[0]?.content.substring(0, 1500) +
        "..." || "No blueprint summary available.";

    // 4. --- Get GitHub token if needed ---
    let githubToken: string | null = null;
    if (projectData.githubRepoUrl) {
      const githubAccount = await prisma.account.findFirst({
        where: { userId: userId, provider: "github" },
        select: { access_token: true },
      });
      githubToken = githubAccount?.access_token || null;
      if (!githubToken) {
        log.warn(`GitHub repo exists but token missing. Git push might fail.`);
      }
    }

    // 5. --- CRITICAL: Update Status to EXECUTING IMMEDIATELY ---
    await prisma.landingPage.update({
      where: { id: projectId },
      data: { agentStatus: "EXECUTING" },
    });
    log.info("Status updated to EXECUTING before sending Inngest event.");

    // 6. --- Send Event to Inngest ---
    log.info(
      `Sending event 'agent/execute.step.requested' for step ${currentStep}`
    );
    await inngest.send({
      name: "agent/execute.step.requested",
      id: `${projectId}-step-${currentStep}-${Date.now()}`, // Idempotency key
      // Add user context for Inngest dashboard
      user: { id: userId },
      data: {
        projectId: projectId,
        userId: userId,
        stepIndex: currentStep,
        taskDescription: currentTask.task,
        blueprintSummary: blueprintSummary,
        userResponses: projectData.agentUserResponses as Record<
          string,
          string
        > | null,
        githubToken: githubToken,
        githubRepoUrl: projectData.githubRepoUrl,
        currentHistoryLength: currentHistory.length, // Pass current history length
      },
    });

    // 6. --- Update Status (If retrying from ERROR) ---
    let nextStatus = projectData.agentStatus; // Keep current status usually
    if (projectData.agentStatus === "ERROR") {
      nextStatus = "EXECUTING"; // Mark as executing immediately on retry
      await prisma.landingPage.update({
        where: { id: projectId },
        data: { agentStatus: nextStatus },
      });
      log.info("Resetting status from ERROR to EXECUTING for retry.");
    }

    // 7. --- Return Immediate Response ---
    log.info("Event sent successfully. Returning 202 Accepted response.");
    return NextResponse.json(
      {
        status: "queued",
        message: `Step ${currentStep + 1} execution requested. Check status for updates.`,
        nextStepIndex: currentStep, // Indicate which step is being processed
        agentStatus: nextStatus, // Return current or updated status
      },
      { status: 202 } // 202 Accepted
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    log.error(
      `Error processing execute request: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
    // Avoid updating DB status here on generic errors, let the function handle ERROR state
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
