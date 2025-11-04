// src/inngest/functions.ts

import { inngest } from "./client"; // Import client and event types
import prisma from "@/lib/prisma";
import { SandboxService } from "@/lib/services/sandbox-service";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { logger } from "@/lib/logger";
import type { PlanStep, StepResult } from "@/types/agent"; // Import types
import { Prisma } from "@prisma/client";
import { z } from "zod"; // Ensure Zod is imported
import { Octokit } from "@octokit/rest";

// --- Zod Schema for AI JSON Response ---
// Defines the expected structure for execution step outputs from the AI
const aiExecutionResponseSchema = z.object({
  files_to_write: z
    .array(
      z.object({
        path: z
          .string()
          .min(1, "File path cannot be empty.")
          // Ensure path is relative and safe
          .refine(
            (p) => !p.startsWith("/") && !p.includes(".."),
            "Path must be relative and cannot contain '..'."
          ),
        content: z.string(), // Allow empty content
      })
    )
    .optional()
    .default([]),
  commands_to_run: z
    .array(z.string().min(1, "Command cannot be empty."))
    .optional()
    .default([]),
  summary: z
    .string()
    .min(1, "Summary cannot be empty.")
    .max(250, "Summary too long."), // Enforce summary presence and length
});
type AiExecutionResponse = z.infer<typeof aiExecutionResponseSchema>;

// Zod schema for the AI's expected JSON output for debugging steps
const aiDebugResponseSchema = z.object({
  // Expects an array of commands, usually just one, or a specific "Cannot fix." string
  fix: z.union([z.array(z.string().min(1)), z.literal("Cannot fix.")]),
});
type _AiDebugResponse = z.infer<typeof aiDebugResponseSchema>;

// --- Inngest Function Definition ---
export const executeAgentStep = inngest.createFunction(
  {
    id: "execute-agent-step", // Unique ID for this function
    name: "Execute AI Agent Build Step", // Human-readable name
    retries: 2, // Configure retries for transient errors
    timeouts: { start: "30m" },
  },
  { event: "agent/execute.step.requested" }, // Triggered by this event
  async ({ event, step }) => {
    // --- Extract data from the incoming event ---
    const {
      projectId,
      userId,
      stepIndex,
      taskDescription,
      blueprintSummary,
      userResponses,
      githubToken,
      githubRepoUrl,
      currentHistoryLength,
    } = event.data;

    // --- Setup contextual logging ---
    const log = logger.child({
      inngestFunction: "executeAgentStep",
      projectId,
      userId,
      stepIndex,
      runId: event.id,
    });

    log.info(`Executing step ${stepIndex}: "${taskDescription}"`);

    // --- Initialize step result tracking ---
    const startTime = new Date();
    let stepResult: Partial<StepResult> = {
      startTime: startTime.toISOString(),
      taskIndex: stepIndex,
      taskDescription: taskDescription,
      status: "error",
      filesWritten: [],
      commandsRun: [],
      summary: "Execution did not complete successfully.",
      prUrl: null, // Initialize prUrl
    };
    let currentHistory: StepResult[] = []; // Store history fetched at the start

    try {
      // --- Fetch Fresh Project State ---
      currentHistory = await step.run("fetch-history", async () => {
        const projectState = await prisma.landingPage.findUnique({
          where: { id: projectId, userId: userId }, // Verify ownership
          select: { agentExecutionHistory: true },
        });
        if (!projectState) {
          throw new Error(
            `Project not found or user ${userId} does not have access.`
          );
        }
        return (
          (projectState.agentExecutionHistory as StepResult[] | null) || []
        );
      });

      if (currentHistory.length !== currentHistoryLength) {
        log.warn(
          `History length mismatch. Event data: ${currentHistoryLength}, DB: ${currentHistory.length}. Proceeding.`
        );
      }

      await step.run(
        "verify-sandbox-health",

        async () => {
          log.info("Verifying sandbox health before execution...");
          try {
            const healthCheck = await SandboxService.execCommand(
              projectId,
              userId,
              "echo 'health-check'",
              5 // 5 second timeout
            );

            if (healthCheck.status === "error") {
              throw new Error(
                `Sandbox health check failed: ${healthCheck.stderr}`
              );
            }

            log.info("Sandbox health check passed.");
            return { healthy: true };
          } catch (error) {
            log.error(
              "Sandbox health check failed:",
              error instanceof Error ? error : undefined
            );
            throw new Error(
              `Sandbox is not reachable: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        }
      );

      // --- Update Status to EXECUTING ---
      await step.run("update-status-executing", async () => {
        return await prisma.landingPage.update({
          where: { id: projectId, userId: userId },
          data: { agentStatus: "EXECUTING" },
        });
      });

      // --- Initialize Git Repository First ---
      await step.run("git-init-repository", async () => {
        log.info("Ensuring Git repository is initialized...");
        const initResult = await SandboxService.gitInitIfNeeded(
          projectId,
          userId
        );
        if (!initResult.success) {
          throw new Error(
            `Failed to initialize git repository: ${initResult.details}`
          );
        }
        log.info("Git repository initialized successfully.");
      });

      // --- Setup Git Remote (AFTER git init) ---
      if (githubRepoUrl && githubToken) {
        await step.run("git-setup-remote", async () => {
          log.info("Configuring Git remote 'origin'...");
          const authenticatedUrl = githubRepoUrl.replace(
            "https://",
            `https://${githubToken}@`
          );
          const remoteCmd = `git remote remove origin 2>/dev/null || true && git remote add origin "${authenticatedUrl}"`;
          const remoteResult = await SandboxService.execCommand(
            projectId,
            userId,
            remoteCmd,
            60
          );
          if (remoteResult.status === "error") {
            throw new Error(
              `Failed to configure git remote: ${remoteResult.stderr}`
            );
          }
          log.info("Git remote 'origin' configured successfully.");
        });
      }

      const safeTaskDesc = taskDescription
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 40);
      const branchName = `feat/step-${stepIndex + 1}-${safeTaskDesc || "agent-update"}`;
      log.info(`Using Git branch: ${branchName}`);

      await step.run("git-create-branch", async () => {
        // First check if the repo is empty (no commits)
        const checkCommitsResult = await SandboxService.execCommand(
          projectId,
          userId,
          "git rev-parse HEAD 2>/dev/null",
          30
        );

        if (checkCommitsResult.status === "error") {
          // Repository is empty, create initial commit on main
          log.info("Repository is empty, creating initial commit...");

          // Create a README
          await SandboxService.writeFile(
            projectId,
            userId,
            "README.md",
            `# ${taskDescription}\n\nGenerated by NeuraLaunch AI Agent`
          );

          // Stage and commit
          await SandboxService.gitAddAll(projectId, userId);
          const initialCommit = await SandboxService.gitCommit(
            projectId,
            userId,
            "Initial commit: Project setup"
          );

          if (!initialCommit.success) {
            throw new Error(
              `Failed to create initial commit: ${initialCommit.details}`
            );
          }

          // Push to main first
          if (githubRepoUrl && githubToken) {
            const pushMain = await SandboxService.gitPushToBranch(
              projectId,
              userId,
              githubRepoUrl,
              githubToken,
              "main"
            );
            if (!pushMain.success) {
              log.warn(`Failed to push main branch: ${pushMain.message}`);
            }
          }

          log.info("Initial commit created successfully.");
        }

        // Now create the feature branch
        const branchResult = await SandboxService.gitCreateBranch(
          projectId,
          userId,
          branchName
        );

        if (!branchResult.success) {
          throw new Error(
            `Failed to create git branch '${branchName}': ${branchResult.details}`
          );
        }
        log.info(`Successfully checked out branch: ${branchName}`);
      });

      // --- Construct AI Prompt for Execution (Requesting JSON) ---
      const previousStepsSummary =
        currentHistory.length > 0
          ? "Previous Steps Completed Summary:\n" +
            currentHistory
              .map((h, i) => `- Step ${i + 1}: ${h.summary} (${h.status})`)
              .join("\n")
          : "This is the first step.";

      const executionPrompt = `
You are an AI Software Engineer executing a single step to build a web application.
Project Blueprint Summary:
---
${blueprintSummary}
---
User Preferences/Answers:
---
${userResponses ? JSON.stringify(userResponses, null, 2) : "None provided."}
---
Plan Context:
${previousStepsSummary}
Your Current Task (Step ${stepIndex + 1}): ${taskDescription}

**Instructions:**
1. Determine the code modifications OR shell commands required to COMPLETE **only this specific task**.
2. Assume root directory '/workspace' of a standard Next.js + Prisma project.
3. Provide your response ONLY as a valid JSON object matching the following structure:
\`\`\`json
{
  "files_to_write": [
    {
      "path": "src/components/NewComponent.tsx",
      "content": "Full file content here..."
    }
  ],
  "commands_to_run": [
    "npm install zod",
    "npx prisma generate"
  ],
  "summary": "Brief summary (1-2 sentences) of actions taken for this step."
}
\`\`\`
4. Ensure \`path\` is relative, safe, and does not use '..'.
5. If no files need writing, provide an empty \`"files_to_write": []\`.
6. If no commands need running, provide an empty \`"commands_to_run": []\`.
7. Ensure the \`summary\` is present and accurately reflects the changes.
8. Focus ONLY on the current task. Ensure the JSON is perfectly valid.
`;

      // --- Call AI Orchestrator (Requesting JSON) ---
      const aiResponseJson = await step.run(
        "call-ai-for-execution",
        async () => {
          return await executeAITaskSimple(AITaskType.AGENT_EXECUTE_STEP, {
            prompt: executionPrompt,
            responseFormat: { type: "json_object" },
          });
        }
      );

      // --- Parse and Validate AI JSON Response ---
      let aiParsedResponse: AiExecutionResponse;
      try {
        // Strip markdown code blocks if present
        let cleanedJson = aiResponseJson.trim();
        if (cleanedJson.startsWith("```json")) {
          cleanedJson = cleanedJson
            .replace(/^```json\s*\n?/, "")
            .replace(/\n?```\s*$/, "");
        } else if (cleanedJson.startsWith("```")) {
          cleanedJson = cleanedJson
            .replace(/^```\s*\n?/, "")
            .replace(/\n?```\s*$/, "");
        }

        const rawJson = JSON.parse(cleanedJson) as unknown;
        aiParsedResponse = aiExecutionResponseSchema.parse(rawJson);
        stepResult.summary = aiParsedResponse.summary;
        log.info(
          `AI JSON response parsed successfully. Files: ${aiParsedResponse.files_to_write.length}, Commands: ${aiParsedResponse.commands_to_run.length}. Summary: ${aiParsedResponse.summary}`
        );
      } catch (parseError) {
        log.error(
          "Failed to parse or validate AI JSON response:",
          parseError instanceof Error ? parseError : undefined,
          { rawResponse: aiResponseJson }
        );
        throw new Error(
          `AI returned invalid JSON structure: ${parseError instanceof Error ? parseError.message : "Validation failed"}`
        );
      }

      // --- Execute Sandbox Actions ---
      // Write files
      for (const fileToWrite of aiParsedResponse.files_to_write) {
        const fileStepId = `write-file-${stepIndex}-${fileToWrite.path.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50)}`;
        const writeOpResult = await step.run(fileStepId, async () => {
          log.debug(`Writing file via SandboxService: ${fileToWrite.path}`);
          return await SandboxService.writeFile(
            projectId,
            userId,
            fileToWrite.path,
            fileToWrite.content
          );
        });
        stepResult.filesWritten!.push({
          path: fileToWrite.path,
          success: writeOpResult.status === "success",
          message: writeOpResult.message,
        });
        if (writeOpResult.status === "error") {
          throw new Error(
            `Sandbox failed to write file "${fileToWrite.path}": ${writeOpResult.message}`
          );
        }
      }

      // Run commands with self-correction
      for (let i = 0; i < aiParsedResponse.commands_to_run.length; i++) {
        const command = aiParsedResponse.commands_to_run[i];
        let currentCommand = command;
        let attempt = 1;
        const maxAttempts = 3;
        let commandSuccessful = false;

        while (attempt <= maxAttempts) {
          const commandStepId = `exec-cmd-${stepIndex}-cmd${i}-attempt${attempt}`;
          log.debug(
            `Executing command via SandboxService (Attempt ${attempt}): ${currentCommand}`
          );

          const execOpResult = await step.run(commandStepId, async () => {
            return await SandboxService.execCommand(
              projectId,
              userId,
              currentCommand,
              900 // 15 minutes timeout
            );
          });

          stepResult.commandsRun!.push({
            command: currentCommand,
            attempt,
            exitCode: execOpResult.exitCode,
            stdout: execOpResult.stdout,
            stderr: execOpResult.stderr,
            correctedCommand: attempt > 1 ? command : undefined,
          });

          if (execOpResult.status === "success") {
            log.info(`Command successful: "${currentCommand}"`);
            commandSuccessful = true;
            break;
          }

          // --- Self-Correction on Failure ---
          log.warn(
            `Command failed (Attempt ${attempt}): "${currentCommand}". Error snippet: ${execOpResult.stderr.substring(0, 500)}...`
          );
          if (attempt >= maxAttempts) {
            throw new Error(
              `Command failed after ${maxAttempts} attempts: "${currentCommand}"\nFinal Error: ${execOpResult.stderr}`
            );
          }

          const debugStepId = `debug-cmd-${stepIndex}-cmd${i}-attempt${attempt}`;
          const fixPrompt = `The shell command failed inside a Docker container:\n\`\`\`sh\n${currentCommand}\n\`\`\`\nExit Code: ${execOpResult.exitCode}\nError Output (stderr):\n\`\`\`\n${execOpResult.stderr}\n\`\`\`\nOutput (stdout):\n\`\`\`\n${execOpResult.stdout}\n\`\`\`\nBased ONLY on this error and the original task ("${taskDescription}"), provide the corrected shell command(s) in a JSON object or respond ONLY with \`{"fix": "Cannot fix."}\`. Structure:\n\`\`\`json\n{\n  "fix": ["corrected command here"]\n}\n\`\`\``;

          const fixResponseJson = await step.run(debugStepId, async () => {
            return await executeAITaskSimple(AITaskType.AGENT_DEBUG_COMMAND, {
              prompt: fixPrompt,
              responseFormat: { type: "json_object" },
            });
          });

          let correctedCommands: string[] = [];
          try {
            const fixParsed = JSON.parse(fixResponseJson) as unknown;
            const validation = aiDebugResponseSchema.safeParse(fixParsed);
            if (!validation.success) {
              throw new Error(
                `AI debug response validation failed: ${validation.error.issues[0]?.message}`
              );
            }
            if (validation.data.fix === "Cannot fix.") {
              log.error(
                `AI explicitly could not fix command: ${currentCommand}`
              );
              throw new Error(
                `Command failed and AI could not provide a fix: "${currentCommand}"\nError: ${execOpResult.stderr}`
              );
            }
            correctedCommands = validation.data.fix;
            if (correctedCommands.length === 0) {
              throw new Error(
                "AI fix response provided an empty command array."
              );
            }
          } catch (parseFixError) {
            log.error(
              "Failed to parse or validate AI fix response JSON:",
              parseFixError instanceof Error ? parseFixError : undefined,
              { rawResponse: fixResponseJson }
            );
            throw new Error(
              `Command failed, and AI fix response was invalid: "${currentCommand}"\nError: ${execOpResult.stderr}`
            );
          }

          currentCommand = correctedCommands[0];
          log.info(
            `AI suggested fix (Used for Attempt ${attempt + 1}): "${currentCommand}"`
          );
          attempt++;
        } // End while loop

        if (!commandSuccessful) {
          throw new Error(
            `Command execution failed definitively for: "${command}"`
          );
        }
      } // End for loop

      // --- Git Operations ---
      if (githubRepoUrl && githubToken) {
        await step.run(`git-ops-${stepIndex}`, async () => {
          log.info("Performing Git operations (add, commit, push)...");

          // Note: gitInitIfNeeded and git-setup-remote (earlier) handle init and remote config

          const addCheck = await SandboxService.gitAddAll(projectId, userId);
          if (!addCheck.success)
            throw new Error(`Git add failed: ${addCheck.details}`);

          const commitMsg = `Feat(agent): Step ${stepIndex + 1} - ${taskDescription.substring(0, 50)}`;
          const commitResult = await SandboxService.gitCommit(
            projectId,
            userId,
            commitMsg
          );
          if (
            !commitResult.success &&
            !commitResult.message.includes("nothing to commit")
          ) {
            throw new Error(`Git commit failed: ${commitResult.details}`);
          }

          if (commitResult.committed) {
            log.info(`Changes committed, pushing branch ${branchName}...`);
            const pushResult = await SandboxService.gitPushToBranch(
              projectId,
              userId,
              githubRepoUrl,
              githubToken,
              branchName
            );
            if (!pushResult.success) {
              // Log error but allow step to succeed (best effort push)
              log.error(
                `Git push failed: ${pushResult.message} ${pushResult.details || ""}`
              );
              stepResult.summary += " (Warning: Git push failed)";
            } else {
              log.info("Git push successful.");
            }
          } else {
            log.info("No changes to commit or push for this step.");
          }
        });
      } else {
        log.info(
          "Skipping Git/PR operations: Repo URL or GitHub Token not provided."
        );
      }

      // --- Create GitHub Pull Request ---
      // Only if code was pushed (or no changes) and token/repo exist
      if (
        githubRepoUrl &&
        githubToken &&
        stepResult.summary?.includes("push failed") === false
      ) {
        const prUrl = await step.run(`create-pr-${stepIndex}`, async () => {
          log.info(`Creating GitHub Pull Request for branch ${branchName}...`);
          try {
            const octokit = new Octokit({ auth: githubToken });
            // Fetch project again *inside step.run* to get repo name
            const project = await prisma.landingPage.findUnique({
              where: { id: projectId },
              select: { githubRepoName: true },
            });

            const repoNameFull = project?.githubRepoName;
            if (!repoNameFull)
              throw new Error("githubRepoName is missing from project data.");

            const [owner, repo] = repoNameFull.split("/");
            if (!owner || !repo)
              throw new Error(`Invalid githubRepoName format: ${repoNameFull}`);

            const prTitle = `Agent: Step ${stepIndex + 1} - ${taskDescription}`;
            const prBody = `This PR was automatically generated by the NeuraLaunch AI agent.\n\n**Task:**\n${taskDescription}\n\n**Summary:**\n${stepResult.summary}\n\nA Vercel preview deployment should be available here shortly.`;

            // Check if a PR for this branch already exists
            const { data: existingPRs } = await octokit.rest.pulls.list({
              owner,
              repo,
              head: `${owner}:${branchName}`,
              state: "open",
            });

            if (existingPRs.length > 0) {
              log.warn(
                `PR for branch ${branchName} already exists. Returning existing PR URL.`
              );
              // Optionally update the PR body
              await octokit.rest.pulls.update({
                owner,
                repo,
                pull_number: existingPRs[0].number,
                body: prBody,
              });
              return existingPRs[0].html_url;
            }

            // Create new PR
            const { data: newPR } = await octokit.rest.pulls.create({
              owner,
              repo,
              title: prTitle,
              body: prBody,
              head: branchName,
              base: "main", // Assuming 'main' is your base branch
            });
            log.info(`Pull Request created: ${newPR.html_url}`);
            return newPR.html_url;
          } catch (prError) {
            log.error(
              "Failed to create GitHub Pull Request:",
              prError instanceof Error ? prError : undefined
            );
            stepResult.summary += " (Warning: Failed to create Pull Request)";
            return null;
          }
        });
        stepResult.prUrl = prUrl;
        if (prUrl) {
          stepResult.summary = `${stepResult.summary} View [Pull Request & Preview](${prUrl})`;
        }
      }

      // --- Mark Step as Success ---
      stepResult.status = "success";
      stepResult.endTime = new Date().toISOString();
      log.info(`Step ${stepIndex} completed successfully.`);

      // --- Final DB Update on Success ---
      const finalDbUpdateResult = await step.run(
        "update-db-success",
        async () => {
          // Fetch the plan again to get the accurate total number of steps
          const finalProjectState = await prisma.landingPage.findUnique({
            where: { id: projectId, userId: userId },
            select: { agentPlan: true },
          });

          const plan = finalProjectState?.agentPlan as PlanStep[] | null;
          const totalSteps = plan?.length ?? stepIndex + 1;
          const isComplete = stepIndex + 1 >= totalSteps;
          const finalAgentStatus = isComplete
            ? "COMPLETE"
            : "PAUSED_FOR_PREVIEW";

          return await prisma.landingPage.update({
            where: { id: projectId },
            data: {
              agentStatus: finalAgentStatus,
              agentCurrentStep: stepIndex + 1,
              agentExecutionHistory: [
                ...currentHistory,
                stepResult as StepResult,
              ] as unknown as Prisma.InputJsonValue,
              sandboxLastAccessedAt: new Date(),
            },
            select: { agentStatus: true },
          });
        }
      );
      log.info(
        `Database updated. Final status: ${finalDbUpdateResult.agentStatus}`
      );

      return {
        event,
        body: {
          message: `Step ${stepIndex + 1} completed`,
          status: finalDbUpdateResult.agentStatus,
          prUrl: stepResult.prUrl,
        },
      };
    } catch (error) {
      // --- Error Handling ---
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown execution error occurred";
      log.error(
        `Error during step ${stepIndex} execution: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );

      stepResult.status = "error";
      stepResult.endTime = new Date().toISOString();
      stepResult.errorMessage = errorMessage.substring(0, 1000);
      stepResult.errorDetails =
        error instanceof Error ? error.stack?.substring(0, 2000) : undefined;

      try {
        await step.run("update-db-error", async () => {
          const errorProjectState = await prisma.landingPage.findUnique({
            where: { id: projectId },
            select: { agentExecutionHistory: true },
          });
          const errorHistory =
            (errorProjectState?.agentExecutionHistory as StepResult[] | null) ||
            [];

          return await prisma.landingPage.update({
            where: { id: projectId },
            data: {
              agentStatus: "ERROR",
              agentExecutionHistory: [
                ...errorHistory,
                stepResult as StepResult,
              ] as unknown as Prisma.InputJsonValue,
            },
          });
        });
        log.info("Database updated with ERROR status for project " + projectId);
      } catch (dbError) {
        log.error(
          "CRITICAL: Failed to update database status to ERROR after execution failure:",
          dbError instanceof Error ? dbError : undefined
        );
      }
      throw error;
    }
  }
);
