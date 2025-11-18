// src/inngest/functions/wave-start-function.ts
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { githubAgent } from "@/lib/agents/github/github-agent";
import { executionCoordinator } from "@/lib/orchestrator/execution-coordinator"; // ✅ IMPORT

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

      // ✅ Step 3: USE EXECUTION COORDINATOR to build wave intelligently
      const coordinatorResult = await step.run(
        "build-wave-with-coordinator",
        async () => {
          log.info(
            `[Wave ${waveNumber}] Building wave with ExecutionCoordinator`
          );

          // Call the smart coordinator
          const result = await executionCoordinator.buildWave({
            projectId,
            userId,
            conversationId,
            waveNumber,
            githubBranch: githubResult.branchName,
          });

          if (!result.success) {
            throw new Error(`Wave building failed: ${result.message}`);
          }

          log.info(`[Wave ${waveNumber}] Coordinator built wave:`, {
            totalTasks: result.waveTasks.length,
            breakdown: result.waveBreakdown,
          });

          return result;
        }
      );

      // Step 4: Trigger execution agents (coordinator already did this if autoTrigger=true)
      // But let's explicitly log it here
      await step.run("confirm-agents-triggered", async () => {
        log.info(
          `[Wave ${waveNumber}] ✅ ${coordinatorResult.triggeredTasks.length} agents triggered`
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
