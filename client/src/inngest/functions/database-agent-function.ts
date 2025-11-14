import { databaseAgent } from "@/lib/agents/execution/database-agent";
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { executionCoordinator } from "@/lib/orchestrator/execution-coordinator";
import { githubAgent } from "@/lib/agents/github/github-agent";
import { createAgentError } from "@/lib/error-utils";
import { env } from "@/lib/env";

/**
 * Database Agent Execution Function
 * Handles database schema design, migrations, and Prisma operations
 */
export const databaseAgentFunction = inngest.createFunction(
  {
    id: "database-agent-execute",
    name: "Database Agent - Execute with Full Framework",
    retries: 0, // Retry handled by BaseAgent framework
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
        const gitTool = await import("@/lib/agents/tools/git-tool");
        await gitTool.GitTool.prototype.execute.call(
          { logExecution: () => {}, logError: () => {} },
          { operation: "init" },
          { projectId, userId }
        );
      });

      // Step 4: Create feature branch
      const branchName = await step.run("create-branch", async () => {
        const safeName = (task.input as any).title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, "-")
          .substring(0, 40);

        const branch = `database/${taskId.slice(0, 8)}-${safeName}`;

        const gitTool = await import("@/lib/agents/tools/git-tool");
        const result = await gitTool.GitTool.prototype.execute.call(
          { logExecution: () => {}, logError: () => {} },
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
          taskDetails: task.input as any,
          context: projectContext as any,
        });
      });

      if (!result.success) {
        // Framework handles error recovery automatically
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
            output: result.data as any,
          },
        });
      });

      // Step 7: Commit changes
      await step.run("git-commit", async () => {
        // Stage all
        const gitTool = await import("@/lib/agents/tools/git-tool");
        await gitTool.GitTool.prototype.execute.call(
          { logExecution: () => {}, logError: () => {} },
          { operation: "add" },
          { projectId, userId }
        );

        // Commit
        const commitMessage = `feat(database): ${(task.input as any).title}\n\nTask ID: ${taskId}\nIterations: ${result.iterations}`;
        await gitTool.GitTool.prototype.execute.call(
          { logExecution: () => {}, logError: () => {} },
          { operation: "commit", message: commitMessage },
          { projectId, userId }
        );
      });

      // Step 8: Push to GitHub
      const githubInfo = projectContext.codebase as any;
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
            log.warn("[Database Agent] Git push failed", { error: pushResult.error });
          }
        });
      }

      // Step 9: Create Pull Request
      if (githubInfo?.githubRepoName && env.GITHUB_TOKEN) {
        await step.run("create-pr", async () => {
          const taskDetails = task.input as any;

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
${result.data?.filesCreated?.map((f: string) => `- ${f}`).join("\n") || "N/A"}

### Commands Executed:
${result.data?.commandsRun?.map((c: string) => `- \`${c}\``).join("\n") || "N/A"}

### Acceptance Criteria:
${taskDetails.acceptanceCriteria?.map((c: string) => `- [x] ${c}`).join("\n") || "N/A"}

**Task ID:** ${taskId}
**Agent:** Database Agent (with framework)
**Status:** ✅ Completed

---
*Generated by NeuraLaunch Database Agent with full framework support: tools, memory, dynamic retry, and error recovery.*
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

            log.info("[Database Agent] PR created", {
              prUrl: prResult.prUrl,
            });
          }
        });
      }

      // Step 10: Check if all wave tasks are complete
      await step.run("check-wave-completion", async () => {
        const waveNumber = (event.data as any).waveNumber;

        if (!waveNumber) {
          // Not part of a wave, just trigger coordinator resume
          await executionCoordinator.resume(projectId, taskId);
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
          `[Database Agent] Wave ${waveNumber} progress: ${completedCount}/${totalCount}`
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
            `[Database Agent] All Wave ${waveNumber} tasks complete! Triggering quality checks`
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

      log.error("[Database Agent] Execution failed", createAgentError(errorMessage, { taskId }));

      // Update task status (if not already updated by framework)
      await step.run("mark-failed", async () => {
        const currentTask = await prisma.agentTask.findUnique({
          where: { id: taskId },
          select: { status: true },
        });

        // Only update if not already handled by framework
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
