// src/app/api/projects/[projectId]/agent/execute/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { SandboxService } from "@/lib/services/sandbox-service";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

// --- Zod Schemas for Type Safety ---

// Define schema for plan tasks
const planTaskSchema = z.object({
  task: z.string().min(1),
});

// Define schema for step results
const stepResultSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  taskIndex: z.number(),
  taskDescription: z.string(),
  status: z.enum(["success", "error"]),
  summary: z.string(),
  filesWritten: z
    .array(
      z.object({
        path: z.string(),
        success: z.boolean(),
        message: z.string().optional(),
      })
    )
    .optional(),
  commandsRun: z
    .array(
      z.object({
        command: z.string(),
        attempt: z.number(),
        exitCode: z.number(),
        stdout: z.string().optional(),
        stderr: z.string().optional(),
        correctedCommand: z.string().optional(),
      })
    )
    .optional(),
  errorMessage: z.string().optional(),
  errorDetails: z.string().optional(),
});

// TypeScript type for StepResult
type StepResult = z.infer<typeof stepResultSchema>;

// Zod schema for validating fetched project data from Prisma
const projectDataSchema = z.object({
  agentPlan: z.union([z.array(planTaskSchema), z.null()]),
  agentCurrentStep: z.number().nullable(),
  agentStatus: z.string().nullable(),
  agentUserResponses: z.record(z.string(), z.string()).nullable(),
  agentExecutionHistory: z.union([z.array(stepResultSchema), z.null()]),
  conversation: z
    .object({
      messages: z.array(
        z.object({
          content: z.string(),
        })
      ),
    })
    .nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
): Promise<NextResponse> {
  const startTime = new Date();
  // Initialize result tracking with default error state
  let stepResult: Partial<StepResult> = {
    startTime: startTime.toISOString(),
    status: "error", // Default to error unless explicitly successful
    filesWritten: [],
    commandsRun: [],
  };
  // Need project data accessible in catch block
  let projectData: z.infer<typeof projectDataSchema> | null = null;
  let currentHistory: StepResult[] = []; // Store history here

  try {
    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { projectId } = params;

    // Fetch project data and validate structure
    const rawProjectData = await prisma.landingPage.findFirst({
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

    if (!rawProjectData) {
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }

    // Validate fetched data structure with proper typing
    const validation = projectDataSchema.safeParse(rawProjectData);
    if (!validation.success) {
      logger.error(
        `[Agent Execute] Invalid project data structure for ${projectId}:`,
        undefined,
        { error: validation.error.format() }
      );
      return NextResponse.json(
        { error: "Internal Server Error: Invalid project data." },
        { status: 500 }
      );
    }
    projectData = validation.data; // Assign validated data
    currentHistory = projectData.agentExecutionHistory || []; // Type-safe assignment

    const plan = projectData.agentPlan;
    const currentStep = projectData.agentCurrentStep ?? 0;
    const userResponses = projectData.agentUserResponses;
    
    // Validate conversation data exists
    if (
      !projectData.conversation?.messages ||
      projectData.conversation.messages.length === 0
    ) {
      return NextResponse.json(
        { error: "Blueprint content not found" },
        { status: 400 }
      );
    }
    const blueprintContent = projectData.conversation.messages[0].content;

    stepResult.taskIndex = currentStep;

    // 2. --- Status Check ---
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
      stepResult.status = "success"; // Mark as success if plan is done
      stepResult.endTime = new Date().toISOString();
      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          agentStatus: "COMPLETE",
          agentExecutionHistory: [
            ...currentHistory,
            stepResult as StepResult,
          ] as Prisma.JsonArray,
        },
      });
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

    // 3. --- Update Status to EXECUTING ---
    await prisma.landingPage.update({
      where: { id: projectId },
      data: { agentStatus: "EXECUTING" },
    });
    logger.info(
      `[Agent Execute] Starting task ${currentStep}: "${currentTask.task}" for project ${projectId}`
    );

    // 4. --- Construct AI Prompt for Task Execution ---
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
1.  Generate the necessary code modifications OR shell commands required to COMPLETE **only this specific task**.
2.  Assume you are in the root directory '/workspace' of a standard Next.js/Prisma project.
3.  For code changes, provide the full file content within fenced Markdown code blocks, clearly indicating the file path relative to '/workspace' (e.g., \`\`\`typescript\n// src/components/Button.tsx\n...\n\`\`\`). ONLY provide COMPLETE files. Do NOT provide diffs or partial code.
4.  For shell commands, list them inside a \`\`\`sh\`\`\` code block, one command per line (e.g., \`npm install zod\`). Assume commands run sequentially.
5.  Keep changes focused SOLELY on the current task. Do NOT repeat work from previous steps.
6.  After the code/commands, provide a brief (1-2 sentence) plain text summary of what you did, starting with "Summary: ".

**Output:**
Provide the code blocks and/or shell commands first, then the summary on a new line.
`;

    // 5. --- Call AI Orchestrator ---
    // Add AGENT_EXECUTE_STEP to AITaskType and route (e.g., to GPT-4o or Claude 3.5 Sonnet)
    const aiResponse = await executeAITaskSimple(
      AITaskType.AGENT_EXECUTE_STEP,
      {
        prompt: executionPrompt,
      }
    );

    // 6. --- Parse AI Response ---
    const codeBlocks = extractCodeBlocks(aiResponse);
    const commands = extractCommands(aiResponse);
    const summary = extractSummary(aiResponse);
    stepResult.summary = summary;

    // 7. --- Execute Actions in Sandbox ---
    logger.info(
      `[Agent Execute] Applying actions for task ${currentStep} of project ${projectId}`
    );

    // Write files
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
      if (writeResult.status === "error") {
        throw new Error(
          `Failed to write file ${block.path}: ${writeResult.message}`
        );
      }
    }

    // Run commands with self-correction
    for (const command of commands) {
      logger.debug(`[Agent Execute] Executing command: ${command}`);
      let execResult = await SandboxService.execCommand(
        projectId,
        userId,
        command,
        300
      ); // 5 min timeout
      let attempt = 1;
      const maxAttempts = 3;
      let currentCommand = command; // Track the command being run (original or corrected)

      while (execResult.status === "error" && attempt < maxAttempts) {
        logger.warn(
          `[Agent Execute] Command failed (attempt ${attempt}): "${currentCommand}". Error: ${execResult.stderr.substring(0, 500)}...`
        );
        stepResult.commandsRun!.push({
          command: currentCommand,
          attempt,
          exitCode: execResult.exitCode,
          stderr: execResult.stderr,
          stdout: execResult.stdout,
        }); // Log failed attempt

        const fixPrompt = `
                The following shell command failed inside a Docker container (working directory /workspace):
                \`\`\`sh
                ${currentCommand}
                \`\`\`
                Exit Code: ${execResult.exitCode}
                Error Output (stderr):
                \`\`\`
                ${execResult.stderr}
                \`\`\`
                Output (stdout):
                \`\`\`
                ${execResult.stdout}
                \`\`\`
                Based ONLY on this error and the original task ("${currentTask.task}"), provide the corrected shell command(s) in a \`\`\`sh\`\`\` block to fix this specific error. If the error is complex or requires file changes, respond ONLY with "Cannot fix.".`;

        // Add AGENT_DEBUG_COMMAND to AITaskType and route (e.g., GPT-4o or Claude 3.5 Sonnet)
        const fixResponse = await executeAITaskSimple(
          AITaskType.AGENT_DEBUG_COMMAND,
          {
            prompt: fixPrompt, // Only provide the specific error context for debugging
          }
        );

        const correctedCommands = extractCommands(fixResponse);

        if (
          correctedCommands.length === 0 ||
          fixResponse.includes("Cannot fix.")
        ) {
          logger.error(
            `[Agent Execute] AI could not suggest a fix for command: ${currentCommand}`
          );
          throw new Error(
            `Command failed and AI could not fix: "${currentCommand}"\nError: ${execResult.stderr}`
          );
        }

        currentCommand = correctedCommands[0]; // Try the first suggested fix
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
      } // End self-correction loop

      // Log the final attempt result (whether success or final failure)
      stepResult.commandsRun!.push({
        command: currentCommand,
        attempt,
        exitCode: execResult.exitCode,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        // Add the originally failed command if correction occurred
        ...(attempt > 1 && { correctedCommand: command }),
      });

      // If still failed after retries, throw
      if (execResult.status === "error") {
        throw new Error(
          `Command failed after ${attempt} attempts: "${currentCommand}"\nError: ${execResult.stderr}`
        );
      }
    } // End of commands loop

    // 8. --- Success: Update DB & Report ---
    logger.info(
      `[Agent Execute] Task ${currentStep} completed successfully for project ${projectId}.`
    );
    stepResult.status = "success";
    stepResult.endTime = new Date().toISOString();

    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        agentStatus: "PAUSED_AFTER_STEP",
        agentCurrentStep: currentStep + 1,
        agentExecutionHistory: [
          ...currentHistory,
          stepResult as StepResult,
        ] as Prisma.JsonArray, // Properly cast to Prisma JsonArray type
        sandboxLastAccessedAt: new Date(), // Update last accessed time
      },
    });

    return NextResponse.json(
      {
        status: "success",
        message: `Step ${currentStep + 1} completed: ${summary}`,
        nextStepIndex: currentStep + 1,
        nextTaskDescription:
          currentStep + 1 < plan.length ? plan[currentStep + 1].task : null,
        isComplete: currentStep + 1 >= plan.length,
        agentStatus: "PAUSED_AFTER_STEP",
        stepResult: stepResult,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    // 9. --- Error Handling: Update DB & Report ---
    const errorMessage =
      error instanceof Error ? error.message : "Unknown execution error";
    logger.error(
      `[Agent Execute API] Error during task ${stepResult.taskIndex ?? "unknown"} for project ${params.projectId}: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );

    stepResult.status = "error";
    stepResult.endTime = new Date().toISOString();
    stepResult.errorMessage = errorMessage;
    stepResult.errorDetails = error instanceof Error ? error.stack : undefined;

    // Save error state
    try {
      await prisma.landingPage.update({
        where: { id: params.projectId },
        data: {
          agentStatus: "ERROR",
          // Use the 'currentHistory' fetched at the start
          agentExecutionHistory: [
            ...currentHistory,
            stepResult as StepResult,
          ] as Prisma.JsonArray,
        },
      });
    } catch (dbError) {
      logger.error(
        `[Agent Execute API] Failed to update DB after error for project ${params.projectId}:`,
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
} // End of POST function

// --- Helper Functions ---

interface CodeBlock {
  path: string;
  content: string;
  language?: string;
}

// Updated to be more robust with explicit return type
function extractCodeBlocks(responseText: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  // Regex: ```(language?)\s*\n(// path/to/file.ext\s*\n)?([\s\S]*?)\n```
  const regex = /```(\w+)?\s*(?:\n\/\/\s*(.*?)\s*)?\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(responseText)) !== null) {
    // Simple heuristic: if it doesn't look like a command block, treat as code
    if (
      match[1]?.toLowerCase() !== "sh" &&
      match[1]?.toLowerCase() !== "bash"
    ) {
      // Path might be missing, use a placeholder or try to infer if needed
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

// Updated to find "Summary: " or take text after last block with explicit return type
function extractSummary(responseText: string): string {
  const summaryMatch = responseText.match(/^Summary:\s*([\s\S]+)/im);
  if (summaryMatch) {
    return summaryMatch[1].trim().replace(/[*_`]/g, "");
  }

  // Fallback: text after the last code block
  const lastBlockEnd = responseText.lastIndexOf("```");
  if (lastBlockEnd === -1) {
    return "AI execution completed."; // Default if no summary found
  }
  const summaryText = responseText.substring(lastBlockEnd + 3).trim();
  return summaryText.replace(/[*_`]/g, "") || "AI actions applied."; // Fallback if empty after block
}

