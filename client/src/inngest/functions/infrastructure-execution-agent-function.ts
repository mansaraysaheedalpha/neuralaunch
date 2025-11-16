// src/inngest/functions/infrastructure-execution-agent-function.ts
/**
 * Infrastructure Execution Agent Function
 * Wave-based infrastructure task execution (Docker, CI/CD, env setup)
 * Similar to backend/frontend agents but for infrastructure tasks
 */

import { infrastructureAgent } from "@/lib/agents/infrastructure/infrastructure-agent";
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { githubAgent } from "@/lib/agents/github/github-agent";
import { createAgentError } from "@/lib/error-utils";
import { env } from "@/lib/env";
import { Prisma } from "@prisma/client";

interface TaskInput {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  complexity?: "simple" | "medium";
  estimatedLines?: number;
  [key: string]: unknown;
}

interface CodebaseContext {
  githubRepoUrl?: string;
  githubRepoName?: string;
  [key: string]: unknown;
}

interface FileCreatedInfo {
  path?: string;
  [key: string]: unknown;
}

export const infrastructureExecutionAgentFunction = inngest.createFunction(
  {
    id: "infrastructure-execution-agent",
    name: "Infrastructure Execution Agent - Wave-based Task Execution",
    retries: 0, // Retry handled by BaseAgent framework
    timeouts: { start: "15m" },
  },
  { event: "agent/execution.infrastructure" },
  async ({ event, step }) => {
    const { taskId, projectId, userId, conversationId, waveNumber } =
      event.data;

    const log = logger.child({
      inngestFunction: "infrastructureExecutionAgent",
      projectId,
      taskId,
      waveNumber,
    });

    log.info("[Infrastructure Execution Agent] Starting execution");

    try {
      // Step 1: Get task details
      const task = await step.run("fetch-task", async () => {
        const taskRecord = await prisma.agentTask.findUnique({
          where: { id: taskId },
        });

        if (!taskRecord) {
          throw new Error(`Task ${taskId} not found`);
        }

        return taskRecord;
      });

      // Step 2: Get project context
      type ProjectContext = {
        techStack: string;
        architecture: string;
        codebase: CodebaseContext;
      };

      const projectContext: ProjectContext = await step.run("fetch-context", async () => {
        const context = await prisma.projectContext.findUnique({
          where: { projectId },
        });

        if (!context) {
          throw new Error(`Project ${projectId} not found`);
        }

        return {
          techStack: typeof context.techStack === "string"
            ? context.techStack
            : Array.isArray(context.techStack)
            ? context.techStack.join(", ")
            : context.techStack
            ? JSON.stringify(context.techStack)
            : "",
          architecture: typeof context.architecture === "string"
            ? context.architecture
            : context.architecture
            ? JSON.stringify(context.architecture)
            : "",
          codebase: (context.codebase || {}) as CodebaseContext,
        };
      });

      // Step 3: Create feature branch
      const branchName = await step.run("create-branch", async () => {
        const input = task.input as TaskInput;

        const safeName = input.title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, "-")
          .substring(0, 40);

        const branch = `infrastructure/${taskId.slice(0, 8)}-${safeName}`;

        const gitTool = await import("@/lib/agents/tools/git-tool");
        const result = await gitTool.GitTool.prototype.execute.call(
          { logExecution: () => {}, logError: () => {} },
          { operation: "branch", branchName: branch },
          { projectId, userId }
        );

        if (!result.success) {
          log.warn(
            "[Infrastructure Execution Agent] Branch creation failed, continuing anyway"
          );
        }

        return branch;
      });

      // Step 4: Execute task with FULL FRAMEWORK
      const result = await step.run("execute-task", async () => {
        log.info("[Infrastructure Execution Agent] Executing with framework");

        const input = task.input as TaskInput;
        // Provide defaults if missing
        const fullTaskDetails = {
          ...input,
          context: projectContext,
          estimatedLines: input.estimatedLines ?? 100,
          description: input.description ?? "",
          complexity: input.complexity ?? "simple",
        };
        return await infrastructureAgent.execute({
          taskId,
          projectId,
          userId,
          conversationId,
          taskDetails: fullTaskDetails,
          context: projectContext as Record<string, unknown>,
        });
      });

      if (!result.success) {
        log.warn("[Infrastructure Execution Agent] Task failed", {
          iterations: result.iterations,
          error: result.error,
        });

        throw new Error(result.error || "Task execution failed");
      }

      log.info("[Infrastructure Execution Agent] Task completed successfully", {
        iterations: result.iterations,
        duration: result.durationMs,
      });

      // Step 5: Update task with branch and completion
      await step.run("update-task", async () => {
        await prisma.agentTask.update({
          where: { id: taskId },
          data: {
            status: "completed",
            branchName: branchName,
            completedAt: new Date(),
            durationMs: result.durationMs,
            output: result.data as Prisma.InputJsonValue,
          },
        });
      });

      // Step 6: Commit changes
      await step.run("git-commit", async () => {
        const gitTool = await import("@/lib/agents/tools/git-tool");
        await gitTool.GitTool.prototype.execute.call(
          { logExecution: () => {}, logError: () => {} },
          { operation: "add" },
          { projectId, userId }
        );

        const taskInput = task.input as TaskInput;
        const commitMessage = `feat(infrastructure): ${taskInput.title}\n\nTask ID: ${taskId}\nIterations: ${result.iterations}`;
        await gitTool.GitTool.prototype.execute.call(
          { logExecution: () => {}, logError: () => {} },
          { operation: "commit", message: commitMessage },
          { projectId, userId }
        );
      });

      // Step 7: Push to GitHub
      const githubInfo = projectContext.codebase;
      if (githubInfo?.githubRepoUrl) {
        await step.run("push-to-github", async () => {
          const gitTool = await import("@/lib/agents/tools/git-tool");
          const pushResult = await gitTool.GitTool.prototype.execute.call(
            { logExecution: () => {}, logError: () => {} },
            {
              operation: "push",
              branchName,
              repoUrl: githubInfo.githubRepoUrl,
              githubToken: env.GITHUB_TOKEN,
            },
            { projectId, userId }
          );

          if (!pushResult.success) {
            log.warn("[Infrastructure Execution Agent] Git push failed", {
              error: pushResult.error,
            });
          }
        });
      }

      // Step 8: Create Pull Request
      if (githubInfo?.githubRepoName && env.GITHUB_TOKEN) {
        await step.run("create-pr", async () => {
          const taskDetails = task.input as TaskInput;
          const filesCreated = (result.data?.filesCreated as FileCreatedInfo[] | undefined) || [];

          const prResult = await githubAgent.createPullRequest({
            projectId,
            repoName: githubInfo.githubRepoName ?? "",
            branchName,
            title: `Infrastructure: ${taskDetails.title}`,
            description: `
## Task: ${taskDetails.title}

${taskDetails.description || ""}

### Completion Details:
- **Iterations:** ${result.iterations}
- **Duration:** ${Math.round(result.durationMs / 1000)}s
- **Files Created:** ${filesCreated.length}

### Files Changed:
${filesCreated.map((f) => `- ${f.path || "unknown"}`).join("\n") || "N/A"}

### Acceptance Criteria:
${taskDetails.acceptanceCriteria?.map((c) => `- [x] ${c}`).join("\n") || "N/A"}

**Task ID:** ${taskId}
**Agent:** Infrastructure Execution Agent
**Status:** ✅ Completed

---
*Generated by NeuraLaunch Infrastructure Execution Agent*
            `,
            githubToken: env.GITHUB_TOKEN!,
          });

          if (prResult.success) {
            await prisma.agentTask.update({
              where: { id: taskId },
              data: {
                prUrl: prResult.prUrl,
                prNumber: prResult.prNumber,
                reviewStatus: "pending",
              },
            });

            log.info("[Infrastructure Execution Agent] PR created", {
              prUrl: prResult.prUrl,
            });
          }
        });
      }

      // Step 9: Check if all wave tasks are complete
      await step.run("check-wave-completion", async () => {
        if (!waveNumber) {
          log.info(
            "[Infrastructure Execution Agent] Not part of a wave, skipping wave completion check"
          );
          return;
        }

        // Count completed vs total tasks in this wave
        const waveTasks = await prisma.agentTask.findMany({
          where: {
            projectId,
            waveNumber,
          },
          select: { id: true, status: true },
        });

        const completedCount = waveTasks.filter(
          (t) => t.status === "completed"
        ).length;
        const totalCount = waveTasks.length;

        log.info(
          `[Infrastructure Execution Agent] Wave ${waveNumber} progress: ${completedCount}/${totalCount}`
        );

        // Update wave record
        await prisma.executionWave.update({
          where: {
            projectId_waveNumber: { projectId, waveNumber },
          },
          data: {
            completedCount,
          },
        });

        // If all tasks complete, trigger wave.complete
        if (completedCount === totalCount) {
          log.info(
            `[Infrastructure Execution Agent] All Wave ${waveNumber} tasks complete! Triggering quality checks`
          );

          await inngest.send({
            name: "agent/wave.complete",
            data: {
              projectId,
              userId,
              conversationId,
              waveNumber,
            },
          });
        }
      });

      return {
        success: true,
        taskId,
        iterations: result.iterations,
        durationMs: result.durationMs,
        filesCreated: result.data?.filesCreated?.length || 0,
        branchName,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.error(
        "[Infrastructure Execution Agent] Execution failed",
        createAgentError(errorMessage, { taskId })
      );

      // Update task status
      await step.run("mark-failed", async () => {
        const currentTask = await prisma.agentTask.findUnique({
          where: { id: taskId },
          select: { status: true },
        });

        if (currentTask?.status === "in_progress") {
          await prisma.agentTask.update({
            where: { id: taskId },
            data: {
              status: "failed",
              error: errorMessage,
              completedAt: new Date(),
            },
          });
        }
      });

      throw error;
    }
  }
);
