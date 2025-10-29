// src/app/api/projects/[projectId]/agent/execute/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { SandboxService } from "@/lib/services/sandbox-service";
import { logger } from "@/lib/logger";
import { StepResult, PlanStep, AgentStatus } from "@/lib/types/agent";
import { triggerAgentEvent } from "@/lib/agent-events";

// --- Helper Functions to manage Agent State ---
async function updateAgentStatus(
  projectId: string,
  status: AgentStatus,
  data: Record<string, any> = {}
) {
  await prisma.landingPage.update({
    where: { id: projectId },
    data: { agentStatus: status, ...data },
  });
  await triggerAgentEvent(projectId, "status_update", {
    status,
    message: `Agent status changed to ${status}`,
  });
}

async function appendExecutionHistory(
  projectId: string,
  stepResult: StepResult
) {
  const project = await prisma.landingPage.findUnique({
    where: { id: projectId },
    select: { agentExecutionHistory: true },
  });
  const currentHistory = (project?.agentExecutionHistory as StepResult[]) || [];
  await prisma.landingPage.update({
    where: { id: projectId },
    data: {
      agentExecutionHistory: [...currentHistory, stepResult] as any,
    },
  });
}

// --- Main POST Function ---
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { projectId } = params;

  triggerBackgroundTask(projectId, userId);

  return NextResponse.json(
    {
      status: "executing",
      message: "Agent execution has been initiated.",
    },
    { status: 202 }
  );
}

// --- Background Task Execution ---
async function triggerBackgroundTask(projectId: string, userId: string) {
  const startTime = new Date();
  let stepResult: Partial<StepResult> = {
    startTime: startTime.toISOString(),
    status: "error",
    filesWritten: [],
    commandsRun: [],
  };

  try {
    const projectData = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: {
        agentPlan: true,
        agentCurrentStep: true,
        agentStatus: true,
        agentUserResponses: true,
        agentExecutionHistory: true,
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
      throw new Error("Project not found or forbidden.");
    }
    const plan = projectData.agentPlan as PlanStep[] | null;
    const currentStep = projectData.agentCurrentStep ?? 0;
    const currentHistory =
      (projectData.agentExecutionHistory as StepResult[] | null) || [];
    stepResult.taskIndex = currentStep;

    if (
      projectData.agentStatus !== "READY_TO_EXECUTE" &&
      projectData.agentStatus !== "PAUSED_AFTER_STEP"
    ) {
      throw new Error(
        `Agent cannot execute in current status: ${projectData.agentStatus}`
      );
    }
    if (!plan || currentStep >= plan.length) {
      await updateAgentStatus(projectId, "COMPLETE");
      return;
    }

    const currentTask = plan[currentStep];
    stepResult.taskDescription = currentTask.task;

    await updateAgentStatus(projectId, "EXECUTING");
    await triggerAgentEvent(projectId, "step_start", {
      taskIndex: currentStep,
      taskDescription: currentTask.task,
    });

    const previousStepsSummary =
      currentHistory.length > 0
        ? "Previous Steps Completed:\n" +
          currentHistory
            .map(
              (h) =>
                `- Step ${
                  h.taskIndex + 1
                }: ${h.taskDescription} (${
                  h.status === "success" ? "OK" : "Failed"
                })`
            )
            .join("\n")
        : "This is the first step.";

    const executionPrompt = `
You are an AI Software Engineer executing a single step in a plan to build a web application.
**Project Blueprint Summary:**
---
${projectData.conversation!.messages[0].content.substring(0, 1500)}...
---
**User Preferences/Answers:**
---
${
  projectData.agentUserResponses
    ? JSON.stringify(projectData.agentUserResponses, null, 2)
    : "None provided."
}
---
**Plan Context:**
${previousStepsSummary}
Current plan step ${currentStep + 1} of ${plan.length}.
**Your Current Task:** ${currentTask.task}
**Instructions:**
1.  Generate the necessary code modifications OR shell commands required to COMPLETE **only this specific task**.
2.  Assume you are in the root directory '/workspace' of a standard Next.js/Prisma project.
3.  For code changes, provide the full file content within fenced Markdown code blocks, clearly indicating the file path relative to '/workspace' (e.g., \`\`\`typescript\n// src/components/Button.tsx\n...\n\`\`\`). ONLY provide COMPLETE files. Do NOT provide diffs or partial code.
4.  For shell commands, list them inside a \`\`\`sh\`\`\` code block, one command per line (e.g., \`npm install zod\`). Assume commands run sequentially.
5.  Keep changes focused SOLELY on the current task. Do NOT repeat work from previous steps.
6.  After the code/commands, provide a brief (1-2 sentence) plain text summary of what you did, starting with "Summary: ".
**Output:**
Provide the code blocks and/or shell commands first, then the summary on a new line.
`;

    const aiResponse = await executeAITaskSimple(
      AITaskType.AGENT_EXECUTE_STEP,
      {
        prompt: executionPrompt,
      }
    );

    const codeBlocks = extractCodeBlocks(aiResponse);
    const commands = extractCommands(aiResponse);
    const summary = extractSummary(aiResponse);
    stepResult.summary = summary;

    for (const block of codeBlocks) {
      await triggerAgentEvent(projectId, "log", {
        message: `Writing file: ${block.path}`,
      });
      const writeResult = await SandboxService.writeFile(
        projectId,
        userId,
        block.path,
        block.content
      );
      stepResult.filesWritten!.push({
        path: block.path,
        success: writeResult.status === "success",
        message: writeResult.message,
      });
      if (writeResult.status === "error") {
        throw new Error(
          `Failed to write file ${block.path}: ${writeResult.message}`
        );
      }
    }

    for (const command of commands) {
      await triggerAgentEvent(projectId, "log", {
        message: `Executing command: ${command}`,
      });
      // ... (self-correction logic from original file)
    }

    stepResult.status = "success";
    stepResult.endTime = new Date().toISOString();

    await appendExecutionHistory(projectId, stepResult as StepResult);
    await updateAgentStatus(projectId, "PAUSED_AFTER_STEP", {
      agentCurrentStep: currentStep + 1,
      sandboxLastAccessedAt: new Date(),
    });

    await triggerAgentEvent(projectId, "step_complete", {
      taskIndex: currentStep,
      summary: summary,
      status: "success",
      isComplete: currentStep + 1 >= plan.length,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown execution error";
    logger.error(
      `[Agent Execute BG] Error for project ${projectId}: ${errorMessage}`
    );

    stepResult.status = "error";
    stepResult.endTime = new

Date().toISOString();
    stepResult.errorMessage = errorMessage;

    await appendExecutionHistory(projectId, stepResult as StepResult);
    await updateAgentStatus(projectId, "ERROR");

    await triggerAgentEvent(projectId, "error", {
      message: errorMessage,
      taskIndex: stepResult.taskIndex,
    });
  }
}

// --- Helper Functions ---
interface CodeBlock {
  path: string;
  content: string;
  language?: string;
}

function extractCodeBlocks(responseText: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```(\w+)?\s*(?:\n\/\/\s*(.*?)\s*)?\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(responseText)) !== null) {
    if (
      match[1]?.toLowerCase() !== "sh" &&
      match[1]?.toLowerCase() !== "bash"
    ) {
      const filePath =
        match[2]?.trim() ||
        `unknown_file_${blocks.length + 1}.${match[1] || "txt"}`;
      blocks.push({
        language: match[1] || undefined,
        path: filePath,
        content: match[3].trim(),
      });
    }
  }
  return blocks;
}

function extractCommands(responseText: string): string[] {
  const commands: string[] = [];
  const regex = /```(sh|bash)\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(responseText)) !== null) {
    const lines = match[2].trim().split("\n");
    commands.push(
      ...lines
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    );
  }
  return commands;
}

function extractSummary(responseText: string): string {
  const summaryMatch = responseText.match(/^Summary:\s*([\s\S]+)/im);
  if (summaryMatch) {
    return summaryMatch[1].trim().replace(/[*_`]/g, "");
  }
  const lastBlockEnd = responseText.lastIndexOf("```");
  if (lastBlockEnd === -1) {
    return "AI execution completed.";
  }
  const summaryText = responseText.substring(lastBlockEnd + 3).trim();
  return summaryText.replace(/[*_`]/g, "") || "AI actions applied.";
}
