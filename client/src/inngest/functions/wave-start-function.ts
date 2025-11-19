// src/inngest/functions/wave-start-function.ts
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { githubAgent } from "@/lib/agents/github/github-agent";
import { executionCoordinator } from "@/lib/orchestrator/execution-coordinator"; // ✅ IMPORT
import { SandboxService } from "@/lib/services/sandbox-service"; // ✅ NEW: For sandbox pre-initialization

export const waveStartFunction = inngest.createFunction(
  {
    id: "wave-start-execution",
    name: "Wave Start - Initialize Wave Execution",
    retries: 2,
  },
  { event: "agent/wave.start" },
  async ({ event, step }) => {
    const { projectId, userId, conversationId, waveNumber } = event.data;

    const log = logger.child({
      inngestFunction: "waveStart",
      projectId,
      waveNumber,
    });

    log.info(`[Wave ${waveNumber}] Starting wave execution`);

    try {
      // Step 1: Create ExecutionWave record
      await step.run("create-wave-record", async () => {
        // Check if wave already exists
        const existingWave = await prisma.executionWave.findUnique({
          where: {
            projectId_waveNumber: { projectId, waveNumber },
          },
        });

        if (!existingWave) {
          await prisma.executionWave.create({
            data: {
              projectId,
              waveNumber,
              status: "in_progress",
              taskCount: 0, // Will be updated by coordinator
            },
          });
          log.info(`[Wave ${waveNumber}] Created wave record`);
        } else {
          log.info(`[Wave ${waveNumber}] Wave record already exists`);
        }
      });

      // Step 2: GitHub Agent - Initialize repo (Wave 1 only) OR create branch
      const githubResult = await step.run("github-setup", async () => {
        // Get GitHub token from user
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            accounts: {
              where: { provider: "github" },
              select: { access_token: true },
            },
          },
        });

        const githubToken = user?.accounts[0]?.access_token;

        if (!githubToken) {
          log.error(
            `[Wave ${waveNumber}] GitHub account not connected for user ${userId}`
          );
          throw new Error(
            "GitHub account not connected. Please go to your profile settings and connect your GitHub account to continue."
          );
        }

        if (waveNumber === 1) {
          // Wave 1: Initialize repository
          log.info(`[Wave ${waveNumber}] Initializing GitHub repository`);

          const setupResult = await githubAgent.setupRepository({
            projectId,
            userId,
            conversationId,
            projectName: `neuralaunch-${projectId.slice(0, 8)}`,
            description: "Built with NeuraLaunch AI Agent System",
            isPrivate: true,
            githubToken,
          });

          if (!setupResult.success) {
            throw new Error(`GitHub setup failed: ${setupResult.message}`);
          }

          log.info(
            `[Wave ${waveNumber}] Repository created: ${setupResult.repoUrl}`
          );

          // ✅ Initialize git in sandbox and set up remote
          log.info(`[Wave ${waveNumber}] Initializing git in sandbox and setting up remote`);

          const { GitTool } = await import("@/lib/agents/tools/git-tool");
          const { SandboxService } = await import("@/lib/services/sandbox-service");
          const gitTool = new GitTool();

          // Step 1: Initialize git repository
          const initResult = await gitTool.execute(
            { operation: "init" },
            { projectId, userId }
          );

          if (!initResult.success) {
            log.warn(`[Wave ${waveNumber}] Git init warning: ${initResult.error}`);
          } else {
            log.info(`[Wave ${waveNumber}] ✅ Git initialized in sandbox`);
          }

          // Step 2: Set up git remote
          const authenticatedUrl = setupResult.repoUrl!.replace(
            "https://github.com/",
            `https://${githubToken}@github.com/`
          );

          const remoteResult = await SandboxService.execCommand(
            projectId,
            userId,
            `git remote remove origin 2>/dev/null || true && git remote add origin "${authenticatedUrl}"`,
            30
          );

          if (remoteResult.status === "error") {
            log.warn(`[Wave ${waveNumber}] Git remote setup warning: ${remoteResult.stderr}`);
          } else {
            log.info(`[Wave ${waveNumber}] ✅ Git remote configured`);
          }

          return {
            repoUrl: setupResult.repoUrl,
            repoName: setupResult.repoName,
            branchName: "main", // Wave 1 works on main initially
          };
        } else {
          // Waves 2+: Create new branch
          const projectContext = await prisma.projectContext.findUnique({
            where: { projectId },
            select: { codebase: true },
          });

          type Codebase = { githubRepoName?: string };
          let codebase: Codebase | undefined;
          if (projectContext?.codebase && typeof projectContext.codebase === "object" && projectContext.codebase !== null) {
            codebase = projectContext.codebase as Codebase;
          }
          const repoName = codebase?.githubRepoName;

          if (!repoName) {
            throw new Error("GitHub repository not found");
          }

          const branchName = `wave-${waveNumber}`;

          log.info(`[Wave ${waveNumber}] Branch: ${branchName}`);

          return {
            repoName,
            branchName,
          };
        }
      });

      // ✅ Step 2.5: PRE-INITIALIZE SANDBOX (CRITICAL: Prevents race condition!)
      // This creates ONE sandbox BEFORE any agents start, ensuring all agents
      // share the same container instead of creating 10+ separate containers
      await step.run("initialize-sandbox", async () => {
        log.info(`[Wave ${waveNumber}] Pre-initializing sandbox to prevent race condition`);

        try {
          // SandboxService is a singleton instance, not a class
          const sandboxUrl = await SandboxService.findOrCreateSandbox(projectId, userId);

          log.info(`[Wave ${waveNumber}] ✅ Sandbox ready at ${sandboxUrl}`);

          return { sandboxUrl, initialized: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          log.error(`[Wave ${waveNumber}] Failed to initialize sandbox: ${errorMsg}`);
          throw new Error(`Sandbox initialization failed: ${errorMsg}`);
        }
      });

      // ✅ Step 3: BUILD wave (get ordered task list, don't trigger yet)
      const coordinatorResult = await step.run(
        "build-wave-with-coordinator",
        async () => {
          log.info(
            `[Wave ${waveNumber}] Building wave with ExecutionCoordinator`
          );

          // Call coordinator to build wave (autoTrigger=false for sequential execution)
          const result = await executionCoordinator.buildWave({
            projectId,
            userId,
            conversationId,
            waveNumber,
            githubBranch: githubResult.branchName,
            autoTrigger: false, // ✅ Don't trigger tasks yet - we'll do it sequentially
          });

          if (!result.success) {
            throw new Error(`Wave building failed: ${result.message}`);
          }

          log.info(`[Wave ${waveNumber}] Coordinator built wave (sequential execution):`, {
            totalTasks: result.waveTasks.length,
            taskPriorities: result.waveTasks.map((t) => t.priority).join(", "),
            breakdown: result.waveBreakdown,
          });

          return result;
        }
      );

      // ✅ Step 4: SEQUENTIALLY trigger and execute tasks in priority order
      // This is the key change for Priority 2: tasks run one at a time
      for (let i = 0; i < coordinatorResult.waveTasks.length; i++) {
        const task = coordinatorResult.waveTasks[i];

        await step.run(`execute-task-${i + 1}-priority-${task.priority}`, async () => {
          log.info(
            `[Wave ${waveNumber}] Starting task ${i + 1}/${coordinatorResult.waveTasks.length}: ${task.input.title} (Priority ${task.priority})`
          );

          // Get event name for this agent type
          const eventMap: Record<string, string> = {
            FrontendAgent: "agent/execution.frontend",
            BackendAgent: "agent/execution.backend",
            InfrastructureAgent: "agent/execution.infrastructure",
            DatabaseAgent: "agent/execution.database",
            IntegrationAgent: "agent/quality.integration",
            TestingAgent: "agent/quality.testing",
          };

          const eventName = eventMap[task.agentName] || "agent/execution.generic";

          // Trigger the task
          await inngest.send({
            name: eventName as "agent/execution.backend" | "agent/execution.frontend" | "agent/execution.infrastructure" | "agent/execution.database" | "agent/quality.integration" | "agent/quality.testing" | "agent/execution.generic",
            data: {
              taskId: task.id,
              projectId,
              userId,
              conversationId,
              taskInput: task.input,
              priority: task.priority,
              waveNumber,
            },
          });

          // Update task status to in_progress
          await prisma.agentTask.update({
            where: { id: task.id },
            data: {
              status: "in_progress",
              startedAt: new Date(),
              branchName: githubResult.branchName,
            },
          });

          log.info(
            `[Wave ${waveNumber}] ✅ Triggered ${task.agentName} for task ${task.id} via ${eventName}`
          );
        });

        // ✅ CRITICAL: Wait for this specific task to complete before starting next task
        log.info(
          `[Wave ${waveNumber}] Waiting for task ${i + 1}/${coordinatorResult.waveTasks.length} (${task.id}) to complete...`
        );

        await step.waitForEvent(`wait-for-task-${i + 1}-completion`, {
          event: "agent/task.complete",
          timeout: "30m", // Generous timeout for complex tasks
          if: `event.data.taskId == "${task.id}"`, // ✅ FIX: Match this specific taskId
        });

        log.info(
          `[Wave ${waveNumber}] ✅ Task ${i + 1}/${coordinatorResult.waveTasks.length} (${task.id}) completed! Moving to next task...`
        );
      }

      // Step 5: Confirm all tasks completed
      await step.run("confirm-all-tasks-complete", async () => {
        log.info(
          `[Wave ${waveNumber}] ✅ All ${coordinatorResult.waveTasks.length} tasks completed sequentially!`
        );

        // Update wave with final task count
        await prisma.executionWave.update({
          where: {
            projectId_waveNumber: { projectId, waveNumber },
          },
          data: {
            taskCount: coordinatorResult.waveTasks.length,
          },
        });
      });

      return {
        success: true,
        waveNumber,
        tasksTriggered: coordinatorResult.triggeredTasks.length,
        githubBranch: githubResult.branchName,
        waveBreakdown: coordinatorResult.waveBreakdown,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.error(`[Wave ${waveNumber}] Failed to start wave: ${errorMessage}`);

      // Mark wave as failed
      await prisma.executionWave.update({
        where: {
          projectId_waveNumber: { projectId, waveNumber },
        },
        data: {
          status: "failed",
        },
      });

      throw error;
    }
  }
);
