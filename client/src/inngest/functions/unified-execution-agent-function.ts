// src/inngest/functions/unified-execution-agent-function.ts
/**
 * Unified Execution Agent Function
 *
 * Consolidates Frontend, Backend, and Infrastructure execution into a single function.
 * Benefits:
 * - Single context load (vs 3 separate loads)
 * - Unified error handling
 * - Simpler orchestration
 * - Better failure recovery
 *
 * Database Agent remains separate as it handles external API provisioning.
 */

import { frontendAgent } from "@/lib/agents/execution/frontend-agent";
import { backendAgent } from "@/lib/agents/execution/backend-agent";
import { infrastructureAgent } from "@/lib/agents/infrastructure/infrastructure-agent";
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { githubAgent } from "@/lib/agents/github/github-agent";
import { createAgentError } from "@/lib/error-utils";
// Note: env.GITHUB_TOKEN removed - now using user's OAuth token from database
import type { Prisma } from "@prisma/client";
import type { ProjectContext } from "@/lib/agents/types/common";

// Type definitions
interface TaskInput {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  complexity?: "simple" | "medium";
  estimatedLines?: number;
  [key: string]: unknown;
}

interface GitHubInfo {
  githubRepoUrl?: string;
  githubRepoName?: string;
  [key: string]: unknown;
}

interface FileCreatedInfo {
  path?: string;
  lines?: number;
  [key: string]: unknown;
}

type AgentType = "frontend" | "backend" | "infrastructure";

// Agent configuration
const AGENT_CONFIG: Record<AgentType, {
  branchPrefix: string;
  commitPrefix: string;
  prTitlePrefix: string;
  agent: typeof frontendAgent | typeof backendAgent | typeof infrastructureAgent;
}> = {
  frontend: {
    branchPrefix: "frontend",
    commitPrefix: "feat(frontend)",
    prTitlePrefix: "Frontend",
    agent: frontendAgent,
  },
  backend: {
    branchPrefix: "backend",
    commitPrefix: "feat(backend)",
    prTitlePrefix: "Backend",
    agent: backendAgent,
  },
  infrastructure: {
    branchPrefix: "infrastructure",
    commitPrefix: "feat(infrastructure)",
    prTitlePrefix: "Infrastructure",
    agent: infrastructureAgent,
  },
};

/**
 * Unified Execution Agent Function
 * Handles frontend, backend, and infrastructure tasks in a single function
 */
export const unifiedExecutionAgentFunction = inngest.createFunction(
  {
    id: "unified-execution-agent",
    name: "Unified Execution Agent - Frontend/Backend/Infrastructure",
    retries: 2,
    timeouts: { start: "15m" },
  },
  { event: "agent/execution.unified" },
  async ({ event, step }) => {
    const {
      taskId,
      projectId,
      userId,
      conversationId,
      waveNumber,
      agentType,
      agentName
    } = event.data;

    const config = AGENT_CONFIG[agentType];

    const log = logger.child({
      inngestFunction: "unifiedExecutionAgent",
      projectId,
      taskId,
      agentType,
      agentName,
      waveNumber,
      runId: event.id,
    });

    log.info(`[Unified Agent] Starting ${agentType} task execution`);

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

      // Step 2: Get project context (loaded ONCE, used by all agent types)
      const projectContext = await step.run("fetch-context", async () => {
        const context = await prisma.projectContext.findUnique({
          where: { projectId },
        });

        if (!context) {
          throw new Error(`Project ${projectId} not found`);
        }

        return {
          techStack: context.techStack as ProjectContext["techStack"],
          architecture: context.architecture,
          codebase: context.codebase,
        } satisfies Partial<ProjectContext>;
      });

      // Step 2b: Get user's GitHub OAuth token (required for git push/PR)
      const userGitHubToken = await step.run("fetch-github-token", async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            accounts: {
              where: { provider: "github" },
              select: { access_token: true },
            },
          },
        });

        const token = user?.accounts[0]?.access_token;
        if (!token) {
          log.warn(`[Unified Agent] No GitHub token found for user ${userId}`);
        }
        return token || null;
      });

      // Step 3: Validate environment
      await step.run("validate-environment", async () => {
        const { ensureEnvironmentReady } = await import(
          "@/lib/agents/utils/environment-validator"
        );
        try {
          await ensureEnvironmentReady(projectId, userId);
          log.info(`[Unified Agent] Environment validation passed`);
        } catch (envError) {
          log.error(`[Unified Agent] Environment validation failed`, envError as Error);
          throw envError;
        }
      });

      // Step 4: Create feature branch
      const branchName = await step.run("create-branch", async () => {
        const input = task.input as TaskInput;
        const title = typeof input.title === "string" ? input.title : "";
        const safeName = title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, "-")
          .substring(0, 40);

        const branch = `${config.branchPrefix}/${taskId.slice(0, 8)}-${safeName}`;

        const { GitTool } = await import("@/lib/agents/tools/git-tool");
        const gitTool = new GitTool();

        // ✅ CRITICAL FIX: Clean sandbox state before creating new branch
        // Without this, branches are created from previous task's HEAD,
        // causing "Snowball PRs" where Task 3 includes Task 1 + Task 2 code

        // 1. Stash any uncommitted changes (safety net)
        await gitTool.execute(
          { operation: "custom", command: "git stash --include-untracked" },
          { projectId, userId }
        );

        // 2. Checkout main/master and pull latest (try main first, then master)
        const checkoutMain = await gitTool.execute(
          { operation: "custom", command: "git checkout main && git pull origin main" },
          { projectId, userId }
        );

        if (!checkoutMain.success) {
          const checkoutMaster = await gitTool.execute(
            { operation: "custom", command: "git checkout master && git pull origin master" },
            { projectId, userId }
          );

          if (!checkoutMaster.success) {
            log.warn(`[Unified Agent] Could not checkout main/master, creating branch from current HEAD`);
          }
        }

        // 3. Now create the new branch off clean main/master
        const result = await gitTool.execute(
          { operation: "branch", branchName: branch },
          { projectId, userId }
        );

        if (!result.success) {
          log.warn(`[Unified Agent] Branch creation failed, continuing anyway`);
        }

        return branch;
      });

      // Step 5: Execute task with the appropriate agent
      const result = await step.run("execute-task", async () => {
        log.info(`[Unified Agent] Executing ${agentType} task with framework`);

        const taskInput = task.input as TaskInput;

        // Build context appropriate for the agent type
        const agentContext = agentType === "infrastructure"
          ? {
              techStack: typeof projectContext.techStack === "string"
                ? projectContext.techStack
                : projectContext.techStack
                  ? JSON.stringify(projectContext.techStack)
                  : "",
              architecture: typeof projectContext.architecture === "string"
                ? projectContext.architecture
                : projectContext.architecture
                  ? JSON.stringify(projectContext.architecture)
                  : "",
              codebase: (projectContext.codebase || {}) as GitHubInfo,
            }
          : projectContext;

        return await config.agent.execute({
          taskId,
          projectId,
          userId,
          conversationId,
          taskDetails: {
            ...taskInput,
            estimatedLines: taskInput.estimatedLines ?? 100,
            description: taskInput.description ?? "",
            complexity: taskInput.complexity ?? "simple",
          },
          context: agentContext as Record<string, unknown>,
        });
      });

      if (!result.success) {
        log.warn(`[Unified Agent] ${agentType} task failed after framework processing`, {
          iterations: result.iterations,
          error: result.error,
        });
        throw new Error(result.error || "Task execution failed");
      }

      log.info(`[Unified Agent] ${agentType} task completed successfully`, {
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

        const taskInput = task.input as TaskInput;
        const commitMessage = `${config.commitPrefix}: ${taskInput.title}\n\nTask ID: ${taskId}\nIterations: ${result.iterations}`;
        await gitTool.execute(
          { operation: "commit", message: commitMessage },
          { projectId, userId }
        );
      });

      // Step 8: Push to GitHub
      // ✅ FIX: Use user's OAuth token instead of env.GITHUB_TOKEN
      const githubInfo = projectContext.codebase as GitHubInfo;
      if (githubInfo?.githubRepoUrl && userGitHubToken) {
        await step.run("push-to-github", async () => {
          const { GitTool } = await import("@/lib/agents/tools/git-tool");
          const gitTool = new GitTool();

          const pushResult = await gitTool.execute(
            {
              operation: "push",
              branchName,
              repoUrl: githubInfo.githubRepoUrl,
              githubToken: userGitHubToken,
            },
            { projectId, userId }
          );

          if (!pushResult.success) {
            log.warn(`[Unified Agent] Git push failed`, { error: pushResult.error });
          } else {
            log.info(`[Unified Agent] Successfully pushed to GitHub branch: ${branchName}`);
          }
        });
      } else {
        log.warn(`[Unified Agent] Skipping git push - missing githubRepoUrl or userGitHubToken`, {
          hasRepoUrl: !!githubInfo?.githubRepoUrl,
          hasToken: !!userGitHubToken,
        });
      }

      // Step 9: Create Pull Request
      // ✅ FIX: Use user's OAuth token instead of env.GITHUB_TOKEN
      if (githubInfo?.githubRepoName && userGitHubToken) {
        await step.run("create-pr", async () => {
          const taskDetails = task.input as TaskInput;
          const filesCreated = (result.data?.filesCreated as FileCreatedInfo[] | undefined) || [];

          const prResult = await githubAgent.createPullRequest({
            projectId,
            repoName: githubInfo.githubRepoName!,
            branchName,
            title: `${config.prTitlePrefix}: ${taskDetails.title}`,
            description: `
## Task: ${taskDetails.title}

${taskDetails.description || ""}

### Completion Details:
- **Iterations:** ${result.iterations}
- **Duration:** ${Math.round(result.durationMs / 1000)}s
- **Files Created:** ${filesCreated.length}

### Files Changed:
${filesCreated.map((f) => `- ${f.path || "unknown"}${f.lines ? ` (${f.lines} lines)` : ""}`).join("\n") || "N/A"}

### Acceptance Criteria:
${taskDetails.acceptanceCriteria?.map((c) => `- [x] ${c}`).join("\n") || "N/A"}

**Task ID:** ${taskId}
**Agent:** ${agentName} (Unified Execution)
**Status:** Completed

---
*Generated by NeuraLaunch Unified Execution Agent*
            `,
            githubToken: userGitHubToken,
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

            log.info(`[Unified Agent] PR created`, { prUrl: prResult.prUrl });
          } else {
            log.warn(`[Unified Agent] PR creation failed`, { message: prResult.message });
          }
        });
      } else {
        log.warn(`[Unified Agent] Skipping PR creation - missing githubRepoName or userGitHubToken`, {
          hasRepoName: !!githubInfo?.githubRepoName,
          hasToken: !!userGitHubToken,
        });
      }

      // Step 10: Emit task completion event
      await step.run("emit-task-complete", async () => {
        log.info(`[Unified Agent] Emitting task completion event`);

        await inngest.send({
          name: "agent/task.complete",
          data: {
            taskId,
            projectId,
            userId,
            conversationId,
            waveNumber,
            agentName,
            success: true,
          },
        });
      });

      return {
        success: true,
        taskId,
        agentType,
        iterations: result.iterations,
        durationMs: result.durationMs,
        branchName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      log.error(
        `[Unified Agent] ${agentType} execution failed`,
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
