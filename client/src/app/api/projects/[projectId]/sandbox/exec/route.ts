// src/app/api/projects/[projectId]/agent/execute/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { SandboxService } from "@/lib/services/sandbox-service";
import { logger } from "@/lib/logger";

// --- Type Definitions ---

interface PlanTask {
  task: string;
  [key: string]: unknown;
}

interface StepResult {
  startTime: string;
  endTime: string;
  taskIndex: number;
  taskDescription: string;
  status: "success" | "error";
  summary: string;
  filesWritten?: { path: string; success: boolean; message?: string }[];
  commandsRun?: {
    command: string;
    attempt: number;
    exitCode: number;
    stdout?: string;
    stderr?: string;
    correctedCommand?: string;
  }[];
  errorMessage?: string;
  errorDetails?: string;
}

const projectDataSchema = z.object({
  id: z.string(), // Added id for clarity
  agentPlan: z
    .any()
    .refine((val) => val === null || (Array.isArray(val) && val.length > 0), {
      message: "Plan must be a non-empty array or null",
    }),
  agentCurrentStep: z.number().nullable(),
  agentStatus: z.string().nullable(),
  agentUserResponses: z.any().nullable(),
  agentExecutionHistory: z
    .any()
    .refine((val) => val === null || Array.isArray(val), {
      message: "History must be an array or null",
    }),
  githubRepoUrl: z.string().nullable(), // For Git push
  conversation: z
    .object({
      messages: z
        .array(z.object({ content: z.string() }))
        .min(1, { message: "Conversation must have at least one message" }),
    })
    .nullable(),
});

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
  if (summaryMatch) return summaryMatch[1].trim().replace(/[*_`]/g, "");
  const lastBlockEnd = responseText.lastIndexOf("```");
  if (lastBlockEnd === -1) return "AI execution completed.";
  const summaryText = responseText.substring(lastBlockEnd + 3).trim();
  return summaryText.replace(/[*_`]/g, "") || "AI actions applied.";
}

// --- API Route ---

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const params = await context.params;
  const startTime = new Date();
  let stepResult: Partial<StepResult> = {
    startTime: startTime.toISOString(),
    status: "error",
    filesWritten: [],
    commandsRun: [],
  };
  let projectData: z.infer<typeof projectDataSchema> | null = null;
  let currentHistory: StepResult[] = [];
  const { projectId } = params; // Extract projectId early for logging

  try {
    // 1. Authentication & Authorization
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Fetch project data and validate structure
    const rawProjectData = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: {
        id: true, // Select id
        agentPlan: true,
        agentCurrentStep: true,
        agentStatus: true,
        agentUserResponses: true,
        agentExecutionHistory: true,
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

    if (!rawProjectData)
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );

    const validation = projectDataSchema.safeParse(rawProjectData);
    if (!validation.success) {
      logger.error(
        `[Agent Execute] Invalid project data structure for ${projectId}: ${JSON.stringify(validation.error.format())}`
      );
      return NextResponse.json(
        { error: "Internal Server Error: Invalid project data." },
        { status: 500 }
      );
    }
    projectData = validation.data;
    
    const plan = projectData.agentPlan as PlanTask[] | null;
    const currentStep = projectData.agentCurrentStep ?? 0;
    currentHistory =
      (projectData.agentExecutionHistory as StepResult[] | null) || [];

    const userResponses = projectData.agentUserResponses as Record<
      string,
      string
    > | null;

    if (!projectData.conversation?.messages?.[0]?.content) {
      return NextResponse.json(
        { error: "Blueprint context not found" },
        { status: 400 }
      );
    }
    const blueprintContent = projectData.conversation.messages[0].content;

    stepResult.taskIndex = currentStep;

    // 2. Status Check & Plan Completion Check
    if (
      projectData.agentStatus !== "READY_TO_EXECUTE" &&
      projectData.agentStatus !== "PAUSED_AFTER_STEP"
    ) {
      return NextResponse.json(
        {
          error: `Agent cannot execute in current status: ${projectData.agentStatus}`,
        },
        { status: 400 }
      );
    }
    if (!plan || currentStep >= plan.length) {
      stepResult.taskDescription = "End of Plan";
      stepResult.summary = "All tasks in the plan are complete.";
      stepResult.status = "success";
      stepResult.endTime = new Date().toISOString();
      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          agentStatus: "COMPLETE",
          agentExecutionHistory: [
            ...currentHistory,
            stepResult as StepResult,
          ] as any,
        },
      });
      logger.info(`[Agent Execute] Project ${projectId} plan complete.`);
      return NextResponse.json(
        {
          status: "complete",
          message: "All steps complete.",
          agentStatus: "COMPLETE",
        },
        { status: 200 }
      );
    }

    const currentTask = plan[currentStep];
    stepResult.taskDescription = currentTask.task;

    // 3. Update Status to EXECUTING
    await prisma.landingPage.update({
      where: { id: projectId },
      data: { agentStatus: "EXECUTING" },
    });
    logger.info(
      `[Agent Execute] Starting task ${currentStep}: "${currentTask.task}" for project ${projectId}`
    );

    // 4. Construct AI Prompt for Task Execution
    const previousStepsSummary =
      currentHistory.length > 0
        ? "Previous Steps Completed:\n" +
          currentHistory
            .map(
              (h) =>
                `- Step ${h.taskIndex + 1}: ${h.taskDescription} (${h.status === "success" ? "OK" : "Failed"})`
            )
            .join("\n")
        : "This is the first step.";

    const executionPrompt = `
You are an AI Software Engineer executing a single step in a plan to build a web application.

**Project Blueprint Summary:**
---
${blueprintContent.substring(0, 1500)}...
---
**User Preferences/Answers:**
---
${userResponses ? JSON.stringify(userResponses, null, 2) : "None provided."}
---
**Plan Context:**
${previousStepsSummary}
Current plan step ${currentStep + 1} of ${plan.length}.

**Your Current Task:** ${currentTask.task}

**Instructions:**
1. Generate the necessary code modifications OR shell commands required to COMPLETE **only this specific task**.
2. Assume you are in the root directory '/workspace' of a standard Next.js/Prisma project.
3. For code changes, provide the full file content within fenced Markdown code blocks, clearly indicating the file path relative to '/workspace' (e.g., \`\`\`typescript\n// src/components/Button.tsx\n...\n\`\`\`). ONLY provide COMPLETE files. Do NOT provide diffs or partial code.
4. For shell commands, list them inside a \`\`\`sh\`\`\` code block, one command per line (e.g., \`npm install zod\`). Assume commands run sequentially.
5. Keep changes focused SOLELY on the current task. Do NOT repeat work from previous steps.
6. After the code/commands, provide a brief (1-2 sentence) plain text summary of what you did, starting with "Summary: ".

**Output:** Provide the code blocks and/or shell commands first, then the summary on a new line.`;

    // 5. Call AI Orchestrator
    const aiResponse = await executeAITaskSimple(
      AITaskType.AGENT_EXECUTE_STEP,
      { prompt: executionPrompt }
    );

    // 6. Parse AI Response
    const codeBlocks = extractCodeBlocks(aiResponse);
    const commands = extractCommands(aiResponse);
    const summary = extractSummary(aiResponse);
    stepResult.summary = summary;

    // 7. Execute Actions in Sandbox
    logger.info(
      `[Agent Execute] Applying actions for task ${currentStep} of project ${projectId}`
    );
    for (const block of codeBlocks) {
      logger.debug(`[Agent Execute] Writing file: ${block.path}`);
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
      if (writeResult.status === "error")
        throw new Error(
          `Failed to write file ${block.path}: ${writeResult.message}`
        );
    }

    for (const command of commands) {
      logger.debug(`[Agent Execute] Executing command: ${command}`);
      let execResult = await SandboxService.execCommand(
        projectId,
        userId,
        command,
        300
      );
      let attempt = 1;
      const maxAttempts = 3;
      let currentCommand = command;

      while (execResult.status === "error" && attempt < maxAttempts) {
        const stderrSnippet = execResult.stderr.substring(0, 500);
        logger.warn(
          `[Agent Execute] Command failed (attempt ${attempt}): "${currentCommand}". Error: ${stderrSnippet}...`
        );
        stepResult.commandsRun!.push({
          command: currentCommand,
          attempt,
          exitCode: execResult.exitCode,
          stderr: execResult.stderr,
          stdout: execResult.stdout,
        });

        const fixPrompt = `The shell command failed:\n\`\`\`sh\n${currentCommand}\n\`\`\`\nError:\n\`\`\`\n${execResult.stderr}\n\`\`\`\nProvide ONLY the corrected shell command in \`\`\`sh\`\`\` block or "Cannot fix.".`;
        const fixResponse = await executeAITaskSimple(
          AITaskType.AGENT_DEBUG_COMMAND,
          { prompt: fixPrompt }
        );
        const correctedCommands = extractCommands(fixResponse);

        if (
          correctedCommands.length === 0 ||
          fixResponse.includes("Cannot fix.")
        ) {
          logger.error(
            `[Agent Execute] AI could not fix command: ${currentCommand}`
          );
          throw new Error(
            `Command failed and AI could not fix: "${currentCommand}"\nError: ${execResult.stderr}`
          );
        }
        currentCommand = correctedCommands[0];
        logger.info(
          `[Agent Execute] AI suggested fix (attempt ${attempt + 1}): "${currentCommand}"`
        );
        attempt++;
        execResult = await SandboxService.execCommand(
          projectId,
          userId,
          currentCommand,
          300
        );
      }

      stepResult.commandsRun!.push({
        command: currentCommand,
        attempt,
        exitCode: execResult.exitCode,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        correctedCommand: attempt > 1 ? command : undefined,
      });
      if (execResult.status === "error") {
        throw new Error(
          `Command failed after ${attempt} attempts: "${currentCommand}"\nFinal Error: ${execResult.stderr}`
        );
      }
    } // End commands loop

    // --- Git Commit Step ---
    logger.info(
      `[Agent Execute] Handling Git operations for step ${currentStep}...`
    );
    let gitCommitAttempt = 1;
    const maxGitCommitAttempts = 2;
    let gitCommitSuccess = false;
    let finalCommitMessage = `Feat: Agent completes step ${currentStep + 1} - ${currentTask.task.substring(0, 50)}`;
    let gitRepoUrl = projectData.githubRepoUrl; // Use validated data

    const initCheck = await SandboxService.gitInitIfNeeded(projectId, userId);
    if (!initCheck.success) {
      logger.error(
        `[Agent Execute] CRITICAL: Failed to initialize Git repo: ${initCheck.details}`
      );
      stepResult.errorMessage =
        (stepResult.errorMessage ? stepResult.errorMessage + "; " : "") +
        `Git init failed: ${initCheck.details}`;
    } else {
      const addCheck = await SandboxService.gitAddAll(projectId, userId);
      if (!addCheck.success) {
        logger.warn(
          `[Agent Execute] Failed to stage changes (git add): ${addCheck.details}`
        );
        stepResult.errorMessage =
          (stepResult.errorMessage ? stepResult.errorMessage + "; " : "") +
          `Git add failed: ${addCheck.details}`;
      } else {
        while (!gitCommitSuccess && gitCommitAttempt <= maxGitCommitAttempts) {
          logger.debug(
            `[Agent Execute] Attempting git commit (Attempt ${gitCommitAttempt})...`
          );
          const commitResult = await SandboxService.gitCommit(
            projectId,
            userId,
            finalCommitMessage
          );
          if (commitResult.success) {
            gitCommitSuccess = true; // Includes "nothing to commit" case
            logger.info(
              `[Agent Execute] Git commit successful (or no changes) on attempt ${gitCommitAttempt}.`
            );
          } else {
            logger.warn(
              `[Agent Execute] Git commit failed (Attempt ${gitCommitAttempt}): ${commitResult.details}`
            );
            stepResult.errorMessage =
              (stepResult.errorMessage ? stepResult.errorMessage + "; " : "") +
              `Git commit failed (Attempt ${gitCommitAttempt}): ${commitResult.details}`;
            if (gitCommitAttempt < maxGitCommitAttempts) {
              const fixGitPrompt = `Git command failed:\n\`git commit -m "${finalCommitMessage.replace(/"/g, '\\"')}"\`\nError:\n\`${commitResult.details}\`\nSuggest ONE simple shell command in \`\`\`sh\`\`\` block to fix this or "Cannot fix.".`;
              const fixResponse = await executeAITaskSimple(
                AITaskType.AGENT_DEBUG_COMMAND,
                { prompt: fixGitPrompt }
              );
              const suggestedFixCommands = extractCommands(fixResponse);
              if (
                suggestedFixCommands.length > 0 &&
                !fixResponse.includes("Cannot fix.")
              ) {
                const fixCommand = suggestedFixCommands[0];
                logger.info(
                  `[Agent Execute] AI suggested Git fix: "${fixCommand}". Executing...`
                );
                const fixExecResult = await SandboxService.execCommand(
                  projectId,
                  userId,
                  fixCommand,
                  60
                );
                if (fixExecResult.status === "error")
                  logger.error(
                    `[Agent Execute] AI suggested Git fix failed: ${fixExecResult.stderr}`
                  );
                else
                  logger.info(
                    `[Agent Execute] AI suggested Git fix executed successfully.`
                  );
              } else {
                logger.error(
                  `[Agent Execute] AI could not suggest a fix for git commit error.`
                );
                break;
              }
            }
          }
          gitCommitAttempt++;
        } // End commit loop
      }
    } // End Git operations else block

    // --- Git Push Step ---
    if (gitCommitSuccess && gitRepoUrl) {
      logger.info(
        `[Agent Execute] Pushing changes to GitHub repo: ${gitRepoUrl}`
      );
      try {
        const githubAccount = await prisma.account.findFirst({
          where: { userId: userId, provider: "github" },
          select: { access_token: true },
        });
        if (!githubAccount?.access_token) {
          logger.error(
            `[Agent Execute] Cannot push: GitHub token missing for user ${userId}.`
          );
          stepResult.errorMessage =
            (stepResult.errorMessage ? stepResult.errorMessage + "; " : "") +
            "Git push skipped: GitHub token missing.";
        } else {
          const pushResult = await SandboxService.gitPushToRepo(
            projectId,
            userId,
            gitRepoUrl,
            githubAccount.access_token
          );
          if (!pushResult.success) {
            logger.error(
              `[Agent Execute] Git push failed: ${pushResult.message} ${pushResult.details || ""}`
            );
            stepResult.errorMessage =
              (stepResult.errorMessage ? stepResult.errorMessage + "; " : "") +
              `Git push failed: ${pushResult.message}`;
          } else {
            logger.info(
              `[Agent Execute] Git push completed successfully or skipped appropriately.`
            );
          }
        }
      } catch (pushError) {
        logger.error(
          `[Agent Execute] Exception during git push operation:`,
          pushError instanceof Error ? pushError : undefined
        );
        stepResult.errorMessage =
          (stepResult.errorMessage ? stepResult.errorMessage + "; " : "") +
          `Git push failed unexpectedly.`;
      }
    } else if (gitCommitSuccess && !gitRepoUrl) {
      logger.warn(
        `[Agent Execute] Changes committed locally, but no GitHub repo linked for project ${projectId}. Skipping push.`
      );
      stepResult.errorMessage =
        (stepResult.errorMessage ? stepResult.errorMessage + "; " : "") +
        "Git push skipped: No repo linked.";
    }

    // 8. Success: Update DB & Report
    logger.info(
      `[Agent Execute] Task ${currentStep} completed for project ${projectId}.`
    );
    stepResult.status = "success";
    stepResult.endTime = new Date().toISOString();

    const isComplete = currentStep + 1 >= plan.length;
    const finalAgentStatus = isComplete ? "COMPLETE" : "PAUSED_AFTER_STEP";

    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        agentStatus: finalAgentStatus,
        agentCurrentStep: currentStep + 1,
        agentExecutionHistory: [
          ...currentHistory,
          stepResult as StepResult,
        ] as any,
        sandboxLastAccessedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        status: "success",
        message: `Step ${currentStep + 1} completed: ${summary}`,
        nextStepIndex: currentStep + 1,
        nextTaskDescription: isComplete ? null : (plan?.[currentStep + 1]?.task ?? null),
        isComplete: isComplete,
        agentStatus: finalAgentStatus,
        stepResult: stepResult,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    // 9. Error Handling: Update DB & Report
    const errorMessage =
      error instanceof Error ? error.message : "Unknown execution error";
    logger.error(
      `[Agent Execute API] Error during task ${stepResult.taskIndex ?? "unknown"} for project ${projectId}: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );

    stepResult.status = "error";
    stepResult.endTime = new Date().toISOString();
    stepResult.errorMessage = errorMessage;
    stepResult.errorDetails = error instanceof Error ? error.stack : undefined;

    try {
      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          agentStatus: "ERROR",
          agentExecutionHistory: [
            ...currentHistory,
            stepResult as StepResult,
          ] as any,
        },
      });
    } catch (dbError) {
      logger.error(
        `[Agent Execute API] Failed to update DB after error for project ${projectId}:`,
        dbError instanceof Error ? dbError : undefined
      );
    }
    return NextResponse.json(
      {
        error: "Agent failed to complete the task.",
        message: errorMessage,
        stepResult,
      },
      { status: 500 }
    );
  }
}
