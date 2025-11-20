//src\inngest\functions\database-agent-function.ts
import { databaseAgent } from "@/lib/agents/execution/database-agent";
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { githubAgent } from "@/lib/agents/github/github-agent";
import { createAgentError } from "@/lib/error-utils";
import { env } from "@/lib/env";
import type { Prisma } from "@prisma/client";
import type { ProjectContext } from "@/lib/agents/types/common";

// Type definitions
interface TaskInput {
  title: string;
  description: string;
  complexity: "simple" | "medium";
  estimatedLines: number;
  [key: string]: unknown;
}

/**
 * Database Agent Execution Function
 * Handles database schema design, migrations, and Prisma operations
 */
export const databaseAgentFunction = inngest.createFunction(
  {
    id: "database-agent-execute",
    name: "Database Agent - Execute with Full Framework",
    retries: 2, // Retry handled by BaseAgent framework
    timeouts: { start: "15m" },
  },
  { event: "agent/execution.database" },
  async ({ event, step }) => {
    const { taskId, projectId, userId, conversationId } = event.data;

    const log = logger.child({
      inngestFunction: "databaseAgentExecute",
      projectId,
      taskId,
      runId: event.id,
    });

    log.info("[Database Agent] Starting execution");

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
      const projectContext = await step.run("fetch-context", async () => {
        const context = await prisma.projectContext.findUnique({
          where: { projectId },
        });

        if (!context) {
          throw new Error(`Project ${projectId} not found`);
        }

        return {
          techStack: context.techStack,
          architecture: context.architecture,
          codebase: context.codebase,
        };
      });

      // Step 3: Initialize Git if needed
      await step.run("git-init", async () => {
        const { GitTool } = await import("@/lib/agents/tools/git-tool");
        const gitTool = new GitTool();
        await gitTool.execute({ operation: "init" }, { projectId, userId });
      });

      // Step 4: Create feature branch
      const branchName = await step.run("create-branch", async () => {
        type TaskInput = { title?: string };
        const input: TaskInput =
          typeof task.input === "object" && task.input !== null
            ? (task.input as TaskInput)
            : {};

        const safeName = input.title
          ? input.title
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, "")
              .replace(/\s+/g, "-")
              .substring(0, 40)
          : "untitled";

        const branch = `database/${taskId.slice(0, 8)}-${safeName}`;

        const { GitTool } = await import("@/lib/agents/tools/git-tool");
        const gitTool = new GitTool();

        // Create branch from main/current
        const result = await gitTool.execute(
          { operation: "branch", branchName: branch },
          { projectId, userId }
        );

        if (!result.success) {
          log.warn(
            "[Database Agent] Branch creation failed, continuing anyway"
          );
        }

        return branch;
      });

      // Step 5: Execute task with FULL FRAMEWORK
      const result = await step.run("execute-task", async () => {
        log.info(
          "[Database Agent] Executing with framework (tools, memory, retry, recovery)"
        );

        return await databaseAgent.execute({
          taskId,
          projectId,
          userId,
          conversationId,
          taskDetails: task.input as TaskInput,
          context: projectContext as Partial<ProjectContext>,
        });
      });

      if (!result.success) {
        log.warn("[Database Agent] Task failed after framework processing", {
          iterations: result.iterations,
          error: result.error,
        });
        throw new Error(result.error || "Task execution failed");
      }

      log.info("[Database Agent] Task completed successfully", {
        iterations: result.iterations,
        duration: result.durationMs,
      });

      // Step 6: Update task with branch and completion
      await step.run("update-task", async () => {
        await prisma.agentTask.update({
          where: { id: taskId },
          data: {
            status: "completed",
            branchName: branchName,
            completedAt: new Date(),
            durationMs: result.durationMs,
            output: result.data
              ? (result.data as unknown as Prisma.InputJsonValue)
              : undefined,
          },
        });
      });

      // Step 7: Commit changes
      await step.run("git-commit", async () => {
        const { GitTool } = await import("@/lib/agents/tools/git-tool");
        const gitTool = new GitTool();
        await gitTool.execute({ operation: "add" }, { projectId, userId });

        type TaskInput = { title?: string };
        const input: TaskInput =
          typeof task.input === "object" && task.input !== null
            ? (task.input as TaskInput)
            : {};
        const commitMessage = `feat(database): ${input.title}\n\nTask ID: ${taskId}\nIterations: ${result.iterations}`;
        await gitTool.execute(
          { operation: "commit", message: commitMessage },
          { projectId, userId }
        );
      });

      // Step 8: Push to GitHub & Create PR
      type GithubInfo = { githubRepoUrl?: string; githubRepoName?: string };
      const githubInfo = projectContext.codebase as GithubInfo;

      if (
        githubInfo &&
        typeof githubInfo.githubRepoUrl === "string" &&
        env.GITHUB_TOKEN
      ) {
        await step.run("push-and-pr", async () => {
          const { GitTool } = await import("@/lib/agents/tools/git-tool");
          const gitTool = new GitTool();

          // Push
          await gitTool.execute(
            {
              operation: "push",
              branchName,
              repoUrl: githubInfo.githubRepoUrl,
              githubToken: env.GITHUB_TOKEN,
            },
            { projectId, userId }
          );

          // Create PR (if repo name exists)
          if (githubInfo.githubRepoName) {
            type TaskDetails = {
              title?: string;
              description?: string;
              acceptanceCriteria?: string[];
              [key: string]: unknown;
            };
            const taskDetails: TaskDetails =
              typeof task.input === "object" && task.input !== null
                ? (task.input as TaskDetails)
                : {};

            const prResult = await githubAgent.createPullRequest({
              projectId,
              repoName: githubInfo.githubRepoName,
              branchName,
              title: `Database: ${taskDetails.title}`,
              description: `
## Task: ${taskDetails.title}

${taskDetails.description}

### Completion Details:
- **Iterations:** ${result.iterations}
- **Duration:** ${Math.round(result.durationMs / 1000)}s
- **Files Created:** ${result.data?.filesCreated?.length || 0}
- **Commands Run:** ${result.data?.commandsRun?.length || 0}

### Files Changed:
${result.data?.filesCreated?.map((f) => `- ${typeof f === "string" ? f : f.path}`).join("\n") || "N/A"}

### Acceptance Criteria:
${taskDetails.acceptanceCriteria?.map((c: string) => `- [x] ${c}`).join("\n") || "N/A"}

**Task ID:** ${taskId}
**Agent:** Database Agent (with framework)
**Status:** ✅ Completed

---
*Generated by NeuraLaunch Database Agent with full framework support.*
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
            }
          }
        });
      }

      // Step 9: Emit Completion Signal
      // ✅ The Worker's only job is to report completion.
      await step.run("emit-task-complete", async () => {
        const waveNumber = (event.data as { waveNumber?: number }).waveNumber;
        log.info("[Database Agent] Emitting task completion event");

        await inngest.send({
          name: "agent/task.complete",
          data: {
            taskId,
            projectId,
            userId,
            conversationId,
            waveNumber,
            agentName: "DatabaseAgent",
            success: true,
          },
        });
      });

      return {
        success: true,
        taskId,
        durationMs: result.durationMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.error(
        "[Database Agent] Execution failed",
        createAgentError(errorMessage, { taskId })
      );

      await step.run("mark-failed", async () => {
        await prisma.agentTask.update({
          where: { id: taskId },
          data: {
            status: "failed",
            error: errorMessage,
            completedAt: new Date(),
          },
        });
      });

      throw error;
    }
  }
);
