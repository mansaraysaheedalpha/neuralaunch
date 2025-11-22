/**
 * Phase-Based Execution (formerly wave-start-function)
 * Uses execution phases directly from Planning Agent
 * Phase 1 = First execution phase from plan
 * Phase 2 = Second execution phase from plan
 * All tasks in a phase execute sequentially in planner-specified order
 *
 * KEY IMPROVEMENTS:
 * - No task limits (all tasks in phase execute)
 * - Preserves exact planner order (no reordering)
 * - Sequential execution (one task completes before next starts)
 * - Simpler logic (reads directly from executionPlan.phases)
 * - ✅ ADDED: Fast Fail Timeout (15m limit per task)
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

interface EventData {
  projectId: string;
  userId: string;
  conversationId: string;
  waveNumber: number;
}

interface PhaseTask {
  id: string;
  agentName: string;
  input: unknown;
  priority: number;
}

export const waveStartFunction = inngest.createFunction(
  {
    id: "phase-execution",
    name: "Phase Execution - Execute Tasks by Planner Phases",
    retries: 2,
  },
  { event: "agent/wave.start" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ event, step }: any) => {
    // Extract and explicitly type event data to fix ESLint errors
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const eventData = event.data as EventData;
    const projectId = eventData.projectId;
    const userId = eventData.userId;
    const conversationId = eventData.conversationId;
    const waveNumber = eventData.waveNumber;
    const phaseNumber = waveNumber; // Wave 1 = Phase 1, Wave 2 = Phase 2, etc.

    const log = logger.child({
      inngestFunction: "phaseExecution",
      projectId,
      phaseNumber,
    });

    log.info(`[Phase ${phaseNumber}] Starting phase execution`);

    try {
      // Step 1: Get execution plan from database
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const planData = (await step.run("load-execution-plan", async () => {
        const project = await prisma.projectContext.findUnique({
          where: { projectId },
          select: { executionPlan: true },
        });

        if (!project?.executionPlan) {
          throw new Error("No execution plan found");
        }

        const plan = project.executionPlan as unknown as ExecutionPlan;

        if (!plan.phases || plan.phases.length === 0) {
          throw new Error("No phases defined in execution plan");
        }

        if (phaseNumber > plan.phases.length) {
          throw new Error(
            `Phase ${phaseNumber} does not exist (only ${plan.phases.length} phases)`
          );
        }

        const phase = plan.phases[phaseNumber - 1]; // 0-indexed

        log.info(
          `[Phase ${phaseNumber}] Loaded phase: "${phase.name}" with ${phase.taskIds.length} tasks`
        );

        return { plan, phase };
      })) as {
        plan: ExecutionPlan;
        phase: { name: string; taskIds: string[] };
      };

      // Step 2: GitHub setup (Phase 1 only)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const githubResult = (await step.run("github-setup", async () => {
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

          const codebase = projectContext?.codebase as {
            githubRepoName?: string;
          } | null;
          const repoName = codebase?.githubRepoName;

          if (!repoName) {
            throw new Error("GitHub repository not found");
          }

          return {
            repoName,
            branchName: `phase-${phaseNumber}`,
          };
        }
      })) as { repoUrl?: string; repoName: string; branchName: string };

      // Step 3: Initialize wave record in database
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await step.run("initialize-wave-record", async () => {
        const { phase } = planData;

        await prisma.executionWave.upsert({
          where: {
            projectId_waveNumber: { projectId, waveNumber: phaseNumber },
          },
          create: {
            projectId,
            waveNumber: phaseNumber,
            status: "in_progress",
            taskCount: phase.taskIds.length,
            completedCount: 0,
            startedAt: new Date(),
          },
          update: {
            status: "in_progress",
            taskCount: phase.taskIds.length,
            completedCount: 0,
            startedAt: new Date(),
          },
        });

        log.info(
          `[Phase ${phaseNumber}] ✅ Wave record initialized with ${phase.taskIds.length} tasks`
        );
      });

      // Step 4: Pre-initialize sandbox
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await step.run("initialize-sandbox", async () => {
        log.info(`[Phase ${phaseNumber}] Pre-initializing sandbox`);
        const sandboxUrl = await SandboxService.findOrCreateSandbox(
          projectId,
          userId
        );
        log.info(`[Phase ${phaseNumber}] ✅ Sandbox ready: ${sandboxUrl}`);
      });

      // Step 5: Get ALL tasks for this phase from database
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const phaseTasks = (await step.run("load-phase-tasks", async () => {
        const { phase } = planData;

        log.info(`[Phase ${phaseNumber}] Phase configuration:`, {
          phaseName: phase.name,
          taskIdsCount: phase.taskIds?.length || 0,
          hasTaskIds: !!phase.taskIds && phase.taskIds.length > 0,
        });

        let tasksFromDB =
          phase.taskIds && phase.taskIds.length > 0
            ? await prisma.agentTask.findMany({
                where: {
                  projectId,
                  id: { in: phase.taskIds },
                },
              })
            : [];

        // Fallback: If no tasks found with phase IDs, try loading pending tasks
        if (tasksFromDB.length === 0) {
          log.warn(
            `[Phase ${phaseNumber}] No tasks found with phase taskIds, falling back to pending tasks`,
            {
              expectedTaskIds: phase.taskIds,
            }
          );

          tasksFromDB = await prisma.agentTask.findMany({
            where: {
              projectId,
              status: "pending",
              waveNumber: null,
            },
            orderBy: { priority: "asc" },
            take: 12,
          });

          log.info(
            `[Phase ${phaseNumber}] Fallback loaded ${tasksFromDB.length} pending tasks`
          );
        }

        // Sort tasks
        if (
          phase.taskIds &&
          phase.taskIds.length > 0 &&
          tasksFromDB.length > 0
        ) {
          const taskMap = new Map(tasksFromDB.map((t) => [t.id, t]));
          const hasPhaseIdMatch = phase.taskIds.some((id: string) =>
            taskMap.has(id)
          );

          if (hasPhaseIdMatch) {
            const orderedTasks = phase.taskIds
              .map((id: string) => taskMap.get(id))
              .filter(
                (task): task is NonNullable<typeof task> => task !== undefined
              );

            log.info(
              `[Phase ${phaseNumber}] Returning ${orderedTasks.length} tasks in planner order`
            );
            return orderedTasks;
          }
        }

        log.info(
          `[Phase ${phaseNumber}] Returning ${tasksFromDB.length} tasks in priority order`
        );
        return tasksFromDB;
      })) as PhaseTask[];

      if (phaseTasks.length === 0) {
        const taskIdsStr = planData.phase.taskIds
          ? JSON.stringify(planData.phase.taskIds)
          : "none";

        const allTasks = await prisma.agentTask.findMany({
          where: { projectId },
          select: { id: true, status: true },
        });

        throw new Error(
          `No tasks found for Phase ${phaseNumber}. Expected IDs: ${taskIdsStr}. Total tasks in DB: ${allTasks.length}. Ensure Planning Agent synchronized IDs correctly.`
        );
      }

      // Step 6: Execute ALL tasks SEQUENTIALLY in exact planner order
      // ✅ UPDATE: Uses Unified Execution Agent for frontend/backend/infrastructure
      // Database Agent remains separate (external API provisioning)
      for (let i = 0; i < phaseTasks.length; i++) {
        const task = phaseTasks[i];
        const taskNumber = i + 1;
        const totalTasks = phaseTasks.length;

        // Determine if this is a unified agent task or database task
        const unifiedAgents = ["FrontendAgent", "BackendAgent", "InfrastructureAgent"];
        const isUnifiedAgent = unifiedAgents.includes(task.agentName);

        // Map agent names to types for the unified agent
        const agentTypeMap: Record<string, "frontend" | "backend" | "infrastructure"> = {
          FrontendAgent: "frontend",
          BackendAgent: "backend",
          InfrastructureAgent: "infrastructure",
        };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await step.run(
          `execute-task-${taskNumber}-${task.id.slice(0, 8)}`,
          async () => {
            const taskTitle =
              task.input &&
              typeof task.input === "object" &&
              "title" in task.input
                ? String((task.input as { title: unknown }).title)
                : "Unknown";

            log.info(
              `[Phase ${phaseNumber}] 🚀 Task ${taskNumber}/${totalTasks}: ${taskTitle} (${task.agentName})`
            );

            // Route to appropriate agent
            if (isUnifiedAgent) {
              // Use unified execution agent for frontend/backend/infrastructure
              await inngest.send({
                name: "agent/execution.unified" as never,
                data: {
                  taskId: task.id,
                  projectId,
                  userId,
                  conversationId,
                  taskInput: task.input,
                  priority: task.priority,
                  waveNumber: phaseNumber,
                  agentType: agentTypeMap[task.agentName],
                  agentName: task.agentName,
                } as never,
              });
            } else if (task.agentName === "DatabaseAgent") {
              // Database agent remains separate (external API provisioning)
              await inngest.send({
                name: "agent/execution.database" as never,
                data: {
                  taskId: task.id,
                  projectId,
                  userId,
                  conversationId,
                  taskInput: task.input,
                  priority: task.priority,
                  waveNumber: phaseNumber,
                } as never,
              });
            } else {
              // Fallback to generic for unknown agent types
              await inngest.send({
                name: "agent/execution.generic" as never,
                data: {
                  taskId: task.id,
                  projectId,
                  userId,
                  conversationId,
                  taskInput: task.input,
                  priority: task.priority,
                } as never,
              });
            }

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

            log.info(
              `[Phase ${phaseNumber}] ✅ Triggered ${task.agentName} for ${task.id}`
            );
          }
        );

        // Wait for task completion with Timeout
        log.info(
          `[Phase ${phaseNumber}] ⏳ Waiting for task ${taskNumber}/${totalTasks} to complete...`
        );

        try {
          // ✅ FAST FAIL IMPLEMENTATION
          // ✅ FIXED: Added 2-minute buffer to account for:
          // - Event propagation delay between agents
          // - Inngest internal processing time
          // - unified-execution-agent has 15m start timeout, so we wait 17m total
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await step.waitForEvent(`wait-task-completion-${task.id}`, {
            event: "agent/task.complete",
            timeout: "17m", // Agent has 15m, add 2m buffer for event propagation
            if: `event.data.taskId == "${task.id}"`,
          });

          log.info(
            `[Phase ${phaseNumber}] ✅ Task ${taskNumber}/${totalTasks} COMPLETED!`
          );

          // ✅ Update progress incrementally so UI reflects completion
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await step.run(`update-progress-${task.id}`, async () => {
            await prisma.executionWave.update({
              where: {
                projectId_waveNumber: { projectId, waveNumber: phaseNumber },
              },
              data: { completedCount: taskNumber },
            });
          });
        } catch (err) {
          // ❌ HANDLE TIMEOUT
          const error = err instanceof Error ? err : new Error("Unknown error");
          log.error(
            `[Phase ${phaseNumber}] ❌ Task ${task.id} Timed Out!`,
            error
          );

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await step.run(`handle-timeout-${task.id}`, async () => {
            await prisma.agentTask.update({
              where: { id: task.id },
              data: {
                status: "failed",
                error:
                  "Execution timed out after 17 minutes (15m agent limit + 2m buffer). Agent did not report completion.",
                completedAt: new Date(),
              },
            });

            // Mark wave as failed
            await prisma.executionWave.update({
              where: {
                projectId_waveNumber: { projectId, waveNumber: phaseNumber },
              },
              data: { status: "failed", failedCount: { increment: 1 } },
            });
          });

          throw new Error(
            `Wave execution stopped: Task ${task.id} timed out (Agent unresponsive).`
          );
        }
      }

      // Step 7: Mark phase complete
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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

        log.info(
          `[Phase ${phaseNumber}] ✅ All ${phaseTasks.length} tasks completed!`
        );
      });

      // Trigger wave.complete event
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await step.run("trigger-wave-complete", async () => {
        log.info(
          `[Phase ${phaseNumber}] 🎯 Triggering wave.complete event for quality checks`
        );

        await inngest.send({
          name: "agent/wave.complete",
          data: {
            projectId,
            userId,
            conversationId,
            waveNumber: phaseNumber,
          },
        });

        log.info(
          `[Phase ${phaseNumber}] ✅ Wave complete event triggered - quality checks will now run`
        );
      });

      return {
        success: true,
        phaseNumber,
        phaseName: planData.phase.name,
        tasksCompleted: phaseTasks.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
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
