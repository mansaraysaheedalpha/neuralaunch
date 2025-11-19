// src/inngest/functions/wave-start-function.ts
/**
 * Phase-Based Execution (formerly wave-start-function)
 * Uses execution phases directly from Planning Agent
 * Phase 1 = First execution phase from plan
 * Phase 2 = Second execution phase from plan
 * All tasks in a phase execute sequentially in planner-specified order
 */
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { githubAgent } from "@/lib/agents/github/github-agent";
import { SandboxService } from "@/lib/services/sandbox-service";

interface ExecutionPlan {
  tasks: Array<{
    id: string;
    title: string;
    category: string;
    priority: number;
    [key: string]: unknown;
  }>;
  phases: Array<{
    name: string;
    taskIds: string[];
  }>;
}

export const waveStartFunction = inngest.createFunction(
  {
    id: "phase-execution",
    name: "Phase Execution - Execute Tasks by Planner Phases",
    retries: 2,
  },
  { event: "agent/wave.start" },
  async ({ event, step }) => {
    const { projectId, userId, conversationId, waveNumber } = event.data;
    const phaseNumber = waveNumber; // Wave 1 = Phase 1, Wave 2 = Phase 2, etc.

    const log = logger.child({
      inngestFunction: "phaseExecution",
      projectId,
      phaseNumber,
    });

    log.info(`[Phase ${phaseNumber}] Starting phase execution`);

    try {
      // Step 1: Get execution plan from database
      const planData = await step.run("load-execution-plan", async () => {
        const project = await prisma.projectContext.findUnique({
          where: { projectId },
          select: { executionPlan: true },
        });

        if (!project?.executionPlan) {
          throw new Error("No execution plan found");
        }

        const plan = project.executionPlan as ExecutionPlan;

        if (!plan.phases || plan.phases.length === 0) {
          throw new Error("No phases defined in execution plan");
        }

        if (phaseNumber > plan.phases.length) {
          throw new Error(`Phase ${phaseNumber} does not exist (only ${plan.phases.length} phases)`);
        }

        const phase = plan.phases[phaseNumber - 1]; // 0-indexed

        log.info(`[Phase ${phaseNumber}] Loaded phase: "${phase.name}" with ${phase.taskIds.length} tasks`);

        return { plan, phase };
      });

      // Step 2: GitHub setup (Phase 1 only)
      const githubResult = await step.run("github-setup", async () => {
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
          throw new Error("GitHub account not connected");
        }

        if (phaseNumber === 1) {
          log.info(`[Phase ${phaseNumber}] Initializing GitHub repository`);

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

          // Initialize git in sandbox
          const { GitTool } = await import("@/lib/agents/tools/git-tool");
          const gitTool = new GitTool();

          await gitTool.execute({ operation: "init" }, { projectId, userId });

          const authenticatedUrl = setupResult.repoUrl!.replace(
            "https://github.com/",
            `https://${githubToken}@github.com/`
          );

          await SandboxService.execCommand(
            projectId,
            userId,
            `git remote remove origin 2>/dev/null || true && git remote add origin "${authenticatedUrl}"`,
            30
          );

          log.info(`[Phase ${phaseNumber}] ✅ Repository and git initialized`);

          return {
            repoUrl: setupResult.repoUrl,
            repoName: setupResult.repoName,
            branchName: "main",
          };
        } else {
          const projectContext = await prisma.projectContext.findUnique({
            where: { projectId },
            select: { codebase: true },
          });

          const codebase = projectContext?.codebase as { githubRepoName?: string } | null;
          const repoName = codebase?.githubRepoName;

          if (!repoName) {
            throw new Error("GitHub repository not found");
          }

          return {
            repoName,
            branchName: `phase-${phaseNumber}`,
          };
        }
      });

      // Step 3: Pre-initialize sandbox
      await step.run("initialize-sandbox", async () => {
        log.info(`[Phase ${phaseNumber}] Pre-initializing sandbox`);
        const sandboxUrl = await SandboxService.findOrCreateSandbox(projectId, userId);
        log.info(`[Phase ${phaseNumber}] ✅ Sandbox ready: ${sandboxUrl}`);
      });

      // Step 4: Get ALL tasks for this phase from database
      const phaseTasks = await step.run("load-phase-tasks", async () => {
        const { phase } = planData;

        // Get tasks in the EXACT order from phase.taskIds
        const tasksFromDB = await prisma.agentTask.findMany({
          where: {
            projectId,
            id: { in: phase.taskIds },
          },
        });

        // Create a map for quick lookup
        const taskMap = new Map(tasksFromDB.map(t => [t.id, t]));

        // Return tasks in the EXACT order specified by phase.taskIds
        const orderedTasks = phase.taskIds
          .map(id => taskMap.get(id))
          .filter((task): task is NonNullable<typeof task> => task !== undefined);

        log.info(`[Phase ${phaseNumber}] Loaded ${orderedTasks.length} tasks in planner order`);

        return orderedTasks;
      });

      // Step 5: Execute ALL tasks SEQUENTIALLY in exact planner order
      for (let i = 0; i < phaseTasks.length; i++) {
        const task = phaseTasks[i];
        const taskNumber = i + 1;
        const totalTasks = phaseTasks.length;

        // Determine agent type
        const agentMap: Record<string, string> = {
          FrontendAgent: "agent/execution.frontend",
          BackendAgent: "agent/execution.backend",
          InfrastructureAgent: "agent/execution.infrastructure",
          DatabaseAgent: "agent/execution.database",
        };

        const eventName = agentMap[task.agentName] || "agent/execution.generic";

        await step.run(`execute-task-${taskNumber}-${task.id.slice(0, 8)}`, async () => {
          log.info(
            `[Phase ${phaseNumber}] 🚀 Task ${taskNumber}/${totalTasks}: ${task.input && typeof task.input === 'object' && 'title' in task.input ? String(task.input.title) : 'Unknown'} (${task.agentName})`
          );

          // Trigger task
          await inngest.send({
            name: eventName as "agent/execution.backend" | "agent/execution.frontend" | "agent/execution.infrastructure" | "agent/execution.database",
            data: {
              taskId: task.id,
              projectId,
              userId,
              conversationId,
              taskInput: task.input,
              priority: task.priority,
              waveNumber: phaseNumber,
            },
          });

          // Mark as in_progress
          await prisma.agentTask.update({
            where: { id: task.id },
            data: {
              status: "in_progress",
              startedAt: new Date(),
              branchName: githubResult.branchName,
              waveNumber: phaseNumber,
            },
          });

          log.info(`[Phase ${phaseNumber}] ✅ Triggered ${task.agentName} for ${task.id}`);
        });

        // Wait for task completion
        log.info(`[Phase ${phaseNumber}] ⏳ Waiting for task ${taskNumber}/${totalTasks} to complete...`);

        await step.waitForEvent(`wait-task-completion-${task.id}`, {
          event: "agent/task.complete",
          timeout: "30m",
          if: `event.data.taskId == "${task.id}"`,
        });

        log.info(`[Phase ${phaseNumber}] ✅ Task ${taskNumber}/${totalTasks} COMPLETED!`);
      }

      // Step 6: Mark phase complete
      await step.run("mark-phase-complete", async () => {
        await prisma.executionWave.upsert({
          where: {
            projectId_waveNumber: { projectId, waveNumber: phaseNumber },
          },
          create: {
            projectId,
            waveNumber: phaseNumber,
            status: "completed",
            taskCount: phaseTasks.length,
            completedCount: phaseTasks.length,
            completedAt: new Date(),
          },
          update: {
            status: "completed",
            completedCount: phaseTasks.length,
            completedAt: new Date(),
          },
        });

        log.info(`[Phase ${phaseNumber}] ✅ All ${phaseTasks.length} tasks completed!`);
      });

      return {
        success: true,
        phaseNumber,
        phaseName: planData.phase.name,
        tasksCompleted: phaseTasks.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      log.error(`[Phase ${phaseNumber}] Failed: ${errorMessage}`);

      await prisma.executionWave.upsert({
        where: {
          projectId_waveNumber: { projectId, waveNumber: phaseNumber },
        },
        create: {
          projectId,
          waveNumber: phaseNumber,
          status: "failed",
          taskCount: 0,
        },
        update: {
          status: "failed",
        },
      });

      throw error;
    }
  }
);
