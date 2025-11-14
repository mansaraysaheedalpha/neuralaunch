// src/lib/orchestrator/execution-coordinator.ts
/**
 * Execution Queue Coordinator
 * Routes tasks from Planning Agent to specialized execution agents
 * Manages dependencies, parallel execution, and task lifecycle
 */

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { inngest } from "@/inngest/client";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type ExecutionAgentType =
  | "FrontendAgent"
  | "BackendAgent"
  | "InfrastructureAgent"
  | "DatabaseAgent"
  | "IntegrationAgent"
  | "TestingAgent";

export interface TaskInput {
  title: string;
  description?: string;
  complexity: "simple" | "medium" | "high";
  dependencies?: string[];
  files?: string[];
  pattern?: string;
  [key: string]: unknown;
}

export interface ExecutionTask {
  id: string;
  projectId: string;
  agentName: ExecutionAgentType;
  priority: number;
  status: string;
  input: TaskInput;
  dependencies?: string[]; // Task IDs that must complete first
  complexity?: "simple" | "medium";
}

export interface CoordinatorInput {
  projectId: string;
  userId: string;
  conversationId: string;
  autoStart?: boolean; // If true, start execution immediately
}

export interface CoordinatorOutput {
  success: boolean;
  message: string;
  stats: {
    totalTasks: number;
    readyTasks: number;
    blockedTasks: number;
    completedTasks: number;
  };
  triggeredTasks: string[];
  waveNumber?: number; // NEW
  waveBreakdown?: Array<{
    // NEW
    agent: string;
    taskCount: number;
    tasks: Array<{ id: string; title: string; complexity: string }>;
  }>;
}
// ==========================================
// EXECUTION COORDINATOR CLASS
// ==========================================

export class ExecutionCoordinator {
  private readonly name = "ExecutionCoordinator";

  // 🔥 NEW: Wave configuration
  private readonly MAX_TASKS_PER_AGENT_PER_WAVE = 3;
  private readonly PREFER_SIMPLE_TASKS_FIRST = true;

  /**
   * Start execution of tasks for a project
   */
  async start(input: CoordinatorInput): Promise<CoordinatorOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting wave-based execution for project ${input.projectId}`
    );

    try {
      // Step 1: Get all pending tasks
      const tasks = await this.getPendingTasks(input.projectId);

      if (tasks.length === 0) {
        logger.warn(`[${this.name}] No pending tasks found`);
        return {
          success: true,
          message: "No pending tasks to execute",
          stats: {
            totalTasks: 0,
            readyTasks: 0,
            blockedTasks: 0,
            completedTasks: 0,
          },
          triggeredTasks: [],
        };
      }

      logger.info(`[${this.name}] Found ${tasks.length} pending tasks`);

      // Step 2: Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(tasks);

      // Step 3: Get tasks ready for THIS wave (no unmet dependencies)
      const readyTasks = this.getReadyTasks(tasks, dependencyGraph);

      if (readyTasks.length === 0) {
        logger.warn(
          `[${this.name}] No tasks ready (all are blocked by dependencies)`
        );
        return {
          success: true,
          message: "All tasks are waiting for dependencies",
          stats: {
            totalTasks: tasks.length,
            readyTasks: 0,
            blockedTasks: tasks.length,
            completedTasks: await this.getCompletedTasksCount(input.projectId),
          },
          triggeredTasks: [],
        };
      }

      // Step 4: 🔥 CREATE WAVE - Limit tasks per agent
      const wave = this.createWaveWithLimit(readyTasks, 1);

      logger.info(
        `[${this.name}] Wave created: ${wave.tasks.length} tasks across ${wave.agentAssignments.size} agents`
      );

      // Log wave details
      wave.agentAssignments.forEach((tasks, agent) => {
        logger.info(
          `[${this.name}] ${agent}: ${tasks.length} tasks (${tasks.map((t) => t.complexity).join(", ")})`
        );
      });

      // Step 5: Trigger execution if autoStart
      const triggeredTaskIds: string[] = [];

      if (input.autoStart) {
        for (const task of wave.tasks) {
          await this.triggerTaskExecution(task, input);
          triggeredTaskIds.push(task.id);
        }

        // Update wave number in database
        await this.updateWaveNumber(triggeredTaskIds, wave.waveNumber);

        logger.info(
          `[${this.name}] Triggered wave ${wave.waveNumber}: ${triggeredTaskIds.length} tasks`
        );
      }

      // Step 6: Update project phase
      await this.updateProjectPhase(input.projectId, "executing");

      const completedCount = await this.getCompletedTasksCount(input.projectId);

      return {
        success: true,
        message: input.autoStart
          ? `Started wave ${wave.waveNumber}: ${triggeredTaskIds.length} tasks`
          : `Wave ${wave.waveNumber} ready: ${wave.tasks.length} tasks`,
        stats: {
          totalTasks: tasks.length,
          readyTasks: readyTasks.length,
          blockedTasks: tasks.length - readyTasks.length,
          completedTasks: completedCount,
        },
        triggeredTasks: triggeredTaskIds,
        waveNumber: wave.waveNumber,
        waveBreakdown: Array.from(wave.agentAssignments.entries()).map(
          ([agent, tasks]) => ({
            agent,
            taskCount: tasks.length,
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.input.title,
              complexity: t.input.complexity,
            })),
          })
        ),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.name}] Coordination failed:`, error);

      return {
        success: false,
        message: `Execution coordination failed: ${errorMessage}`,
        stats: {
          totalTasks: 0,
          readyTasks: 0,
          blockedTasks: 0,
          completedTasks: 0,
        },
        triggeredTasks: [],
      };
    }
  }

  /**
   * ✅ UPDATED: Create wave with agent task limits
   */
  private createWaveWithLimit(
    readyTasks: ExecutionTask[],
    waveNumber: number
  ): {
    waveNumber: number;
    tasks: ExecutionTask[];
    agentAssignments: Map<string, ExecutionTask[]>;
  } {
    // Sort tasks: simple first, then by priority
    const sortedTasks = [...readyTasks].sort((a, b) => {
      const aComplexity = a.input.complexity || "medium";
      const bComplexity = b.input.complexity || "medium";

      if (this.PREFER_SIMPLE_TASKS_FIRST) {
        if (aComplexity === "simple" && bComplexity !== "simple") return -1;
        if (aComplexity !== "simple" && bComplexity === "simple") return 1;
      }

      return a.priority - b.priority;
    });

    // Group tasks by agent
    const tasksByAgent = new Map<string, ExecutionTask[]>();

    for (const task of sortedTasks) {
      const agent = task.agentName;

      if (!tasksByAgent.has(agent)) {
        tasksByAgent.set(agent, []);
      }

      const agentTasks = tasksByAgent.get(agent)!;

      // ✅ KEY CONSTRAINT: Max 3 tasks per agent per wave
      if (agentTasks.length < this.MAX_TASKS_PER_AGENT_PER_WAVE) {
        agentTasks.push(task);
      } else {
        logger.info(
          `[${this.name}] Agent ${agent} reached limit (${this.MAX_TASKS_PER_AGENT_PER_WAVE} tasks), skipping task ${task.id}`
        );
      }
    }

    // Flatten selected tasks
    const waveTasks: ExecutionTask[] = [];
    tasksByAgent.forEach((tasks) => waveTasks.push(...tasks));

    logger.info(
      `[${this.name}] Wave ${waveNumber} composition:`,
      Array.from(tasksByAgent.entries()).map(([agent, tasks]) => ({
        agent,
        count: tasks.length,
      }))
    );

    return {
      waveNumber,
      tasks: waveTasks,
      agentAssignments: tasksByAgent,
    };
  }

  /**
   * ADD this method to update wave number in database:
   */

  private async updateWaveNumber(
    taskIds: string[],
    waveNumber: number
  ): Promise<void> {
    await prisma.agentTask.updateMany({
      where: {
        id: { in: taskIds },
      },
      data: {
        waveNumber: waveNumber,
      },
    });

    logger.info(
      `[${this.name}] Updated ${taskIds.length} tasks to wave ${waveNumber}`
    );
  }

  /**
   * Resume execution after a task completes
   * This checks if new tasks became unblocked
   */
  async resume(
    projectId: string,
    completedTaskId: string
  ): Promise<CoordinatorOutput> {
    logger.info(
      `[${this.name}] Resuming after task ${completedTaskId} completed`
    );

    try {
      // Get pending tasks
      const tasks = await this.getPendingTasks(projectId);

      if (tasks.length === 0) {
        // All tasks complete! Move to quality check phase
        logger.info(
          `[${this.name}] All tasks complete! Moving to quality check phase`
        );
        await this.updateProjectPhase(projectId, "quality_check");

        // Trigger quality check agents
        await this.triggerQualityCheck(projectId);

        return {
          success: true,
          message: "All execution tasks complete! Starting quality checks.",
          stats: {
            totalTasks: 0,
            readyTasks: 0,
            blockedTasks: 0,
            completedTasks: await this.getCompletedTasksCount(projectId),
          },
          triggeredTasks: [],
        };
      }

      // Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(tasks);

      // Find newly unblocked tasks
      const readyTasks = this.getReadyTasks(tasks, dependencyGraph);

      logger.info(
        `[${this.name}] ${readyTasks.length} tasks now ready after completion`
      );

      // Trigger newly ready tasks
      const triggeredTaskIds: string[] = [];
      for (const task of readyTasks) {
        // Get user info from project
        const project = await prisma.projectContext.findUnique({
          where: { projectId },
          select: { userId: true, conversationId: true },
        });

        if (project) {
          await this.triggerTaskExecution(task, {
            projectId,
            userId: project.userId,
            conversationId: project.conversationId,
            autoStart: true,
          });
          triggeredTaskIds.push(task.id);
        }
      }

      const completedCount = await this.getCompletedTasksCount(projectId);

      return {
        success: true,
        message: `Triggered ${triggeredTaskIds.length} newly unblocked tasks`,
        stats: {
          totalTasks: tasks.length,
          readyTasks: readyTasks.length,
          blockedTasks: tasks.length - readyTasks.length,
          completedTasks: completedCount,
        },
        triggeredTasks: triggeredTaskIds,
      };
    } catch (error) {
      logger.error(`[${this.name}] Resume failed:`, error);
      throw error;
    }
  }

  /**
   * Get all pending tasks for a project
   */
  private async getPendingTasks(projectId: string): Promise<ExecutionTask[]> {
    const tasks = await prisma.agentTask.findMany({
      where: {
        projectId,
        status: "pending",
      },
      orderBy: [
        { priority: "asc" }, // Lower number = higher priority
        { createdAt: "asc" },
      ],
    });

    return tasks.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      agentName: task.agentName as ExecutionAgentType,
      priority: task.priority,
      status: task.status,
      input: task.input as TaskInput,
      dependencies: (task.input as TaskInput)?.dependencies || [],
    }));
  }

  /**
   * Get count of completed tasks
   */
  private async getCompletedTasksCount(projectId: string): Promise<number> {
    return await prisma.agentTask.count({
      where: {
        projectId,
        status: "completed",
      },
    });
  }

  /**
   * Build dependency graph from tasks
   */
  private buildDependencyGraph(tasks: ExecutionTask[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const task of tasks) {
      graph.set(task.id, task.dependencies || []);
    }

    return graph;
  }

  /**
   * Get tasks that are ready to execute (no unmet dependencies)
   */
  private getReadyTasks(
    tasks: ExecutionTask[],
    dependencyGraph: Map<string, string[]>
  ): ExecutionTask[] {
    const readyTasks: ExecutionTask[] = [];

    for (const task of tasks) {
      const dependencies = dependencyGraph.get(task.id) || [];

      // Check if all dependencies are completed
      const allDependenciesMet =
        dependencies.length === 0 ||
        dependencies.every((depId) => !tasks.find((t) => t.id === depId));

      if (allDependenciesMet) {
        readyTasks.push(task);
      }
    }

    return readyTasks;
  }

  /**
   * Trigger execution for a specific task via Inngest
   */
  private async triggerTaskExecution(
    task: ExecutionTask,
    input: CoordinatorInput
  ): Promise<void> {
    logger.info(
      `[${this.name}] Triggering ${task.agentName} for task ${task.id}`
    );

    // Determine which Inngest event to send based on agent type
    const eventName = this.getInngestEventName(task.agentName);

    try {
      await inngest.send({
        name: eventName,
        data: {
          taskId: task.id,
          projectId: input.projectId,
          userId: input.userId,
          taskInput: task.input,
          priority: task.priority,
        },
      });

      // Update task status to 'in_progress'
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: "in_progress",
          startedAt: new Date(),
        },
      });

      logger.info(`[${this.name}] Successfully triggered task ${task.id}`);
    } catch (error) {
      logger.error(`[${this.name}] Failed to trigger task ${task.id}:`, error);
      throw error;
    }
  }

  /**
   * Map agent type to Inngest event name
   */
  private getInngestEventName(agentName: ExecutionAgentType): string {
    const eventMap: Record<ExecutionAgentType, string> = {
      FrontendAgent: "agent/execution.frontend",
      BackendAgent: "agent/execution.backend",
      InfrastructureAgent: "agent/execution.infrastructure",
      DatabaseAgent: "agent/execution.database",
      IntegrationAgent: "agent/quality.integration",
      TestingAgent: "agent/quality.testing",
    };

    return eventMap[agentName] || "agent/execution.generic";
  }

  /**
   * Update project phase in database
   */
  private async updateProjectPhase(
    projectId: string,
    phase: string
  ): Promise<void> {
    await prisma.projectContext.update({
      where: { projectId },
      data: {
        currentPhase: phase,
        updatedAt: new Date(),
      },
    });

    logger.info(
      `[${this.name}] Updated project ${projectId} to phase: ${phase}`
    );
  }

  /**
   * Trigger quality check agents after all execution tasks complete
   */
  private async triggerQualityCheck(projectId: string): Promise<void> {
    logger.info(
      `[${this.name}] Triggering quality check for project ${projectId}`
    );

    try {
      // Send Inngest event to start quality checks
      await inngest.send({
        name: "agent/quality.start",
        data: { projectId },
      });

      logger.info(`[${this.name}] Quality check triggered for ${projectId}`);
    } catch (error) {
      logger.error(`[${this.name}] Failed to trigger quality check:`, error);
    }
  }

  /**
   * Get execution status for a project
   */
  async getStatus(projectId: string): Promise<{
    phase: string;
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    pendingTasks: number;
    failedTasks: number;
    progress: number;
  }> {
    const [total, completed, inProgress, pending, failed, project] =
      await Promise.all([
        prisma.agentTask.count({ where: { projectId } }),
        prisma.agentTask.count({ where: { projectId, status: "completed" } }),
        prisma.agentTask.count({ where: { projectId, status: "in_progress" } }),
        prisma.agentTask.count({ where: { projectId, status: "pending" } }),
        prisma.agentTask.count({ where: { projectId, status: "failed" } }),
        prisma.projectContext.findUnique({
          where: { projectId },
          select: { currentPhase: true },
        }),
      ]);

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      phase: project?.currentPhase || "unknown",
      totalTasks: total,
      completedTasks: completed,
      inProgressTasks: inProgress,
      pendingTasks: pending,
      failedTasks: failed,
      progress,
    };
  }

  /**
   * ✅ NEW METHOD: Build a specific wave with smart task distribution
   * This is what wave-start-function should call
   */
  async buildWave(input: {
    projectId: string;
    userId: string;
    conversationId: string;
    waveNumber: number;
    githubBranch: string;
    autoTrigger?: boolean; // Default true
  }): Promise<{
    success: boolean;
    message: string;
    waveTasks: ExecutionTask[];
    triggeredTasks: string[];
    waveBreakdown: Array<{
      agent: string;
      taskCount: number;
      tasks: Array<{ id: string; title: string; complexity: string }>;
    }>;
  }> {
    const { projectId, userId, conversationId, waveNumber, githubBranch } =
      input;
    const autoTrigger = input.autoTrigger !== false; // Default true

    logger.info(
      `[${this.name}] Building Wave ${waveNumber} for project ${projectId}`
    );

    try {
      // Step 1: Get all pending tasks (not yet assigned to any wave)
      const pendingTasks = await prisma.agentTask.findMany({
        where: {
          projectId,
          status: "pending",
          waveNumber: null, // ✅ Only tasks not yet in a wave
        },
        orderBy: [{ priority: "asc" }],
      });

      if (pendingTasks.length === 0) {
        logger.warn(`[${this.name}] No pending tasks for Wave ${waveNumber}`);
        return {
          success: true,
          message: "No pending tasks available for this wave",
          waveTasks: [],
          triggeredTasks: [],
          waveBreakdown: [],
        };
      }

      logger.info(
        `[${this.name}] Found ${pendingTasks.length} pending tasks to consider`
      );

      // Step 2: Convert to ExecutionTask format
      const tasks: ExecutionTask[] = pendingTasks.map((task) => ({
        id: task.id,
        projectId: task.projectId,
        agentName: task.agentName as ExecutionAgentType,
        priority: task.priority,
        status: task.status,
        input: task.input as TaskInput,
        dependencies: (task.input as TaskInput)?.dependencies || [],
      }));

      // Step 3: Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(tasks);

      // Step 4: Get tasks ready for THIS wave (no unmet dependencies)
      const readyTasks = this.getReadyTasks(tasks, dependencyGraph);

      if (readyTasks.length === 0) {
        logger.warn(
          `[${this.name}] No tasks ready for Wave ${waveNumber} (all blocked by dependencies)`
        );
        return {
          success: true,
          message: "All pending tasks are waiting for dependencies",
          waveTasks: [],
          triggeredTasks: [],
          waveBreakdown: [],
        };
      }

      logger.info(
        `[${this.name}] ${readyTasks.length} tasks are ready (dependencies met)`
      );

      // ✅ Step 5: CREATE WAVE with 3-task-per-agent limit
      const wave = this.createWaveWithLimit(readyTasks, waveNumber);

      logger.info(
        `[${this.name}] Wave ${waveNumber} created: ${wave.tasks.length} tasks across ${wave.agentAssignments.size} agents`
      );

      // Log wave breakdown
      wave.agentAssignments.forEach((tasks, agent) => {
        logger.info(
          `[${this.name}]   ${agent}: ${tasks.length} tasks (${tasks.map((t) => t.input.complexity).join(", ")})`
        );
      });

      // Step 6: Assign tasks to this wave in database
      if (wave.tasks.length > 0) {
        await prisma.agentTask.updateMany({
          where: {
            id: { in: wave.tasks.map((t) => t.id) },
          },
          data: {
            waveNumber: waveNumber,
          },
        });

        logger.info(
          `[${this.name}] Assigned ${wave.tasks.length} tasks to Wave ${waveNumber} in database`
        );
      }

      // Step 7: Trigger execution agents (if autoTrigger)
      const triggeredTaskIds: string[] = [];

      if (autoTrigger) {
        for (const task of wave.tasks) {
          const eventName = this.getInngestEventName(task.agentName);

          logger.info(
            `[${this.name}] Triggering ${task.agentName} for task ${task.id}`
          );

          await inngest.send({
            name: eventName,
            data: {
              taskId: task.id,
              projectId,
              userId,
              taskInput: task.input,
              waveNumber,
              githubBranch,
            },
          });

          // Update task status to in_progress
          await prisma.agentTask.update({
            where: { id: task.id },
            data: {
              status: "in_progress",
              startedAt: new Date(),
              branchName: githubBranch,
            },
          });

          triggeredTaskIds.push(task.id);
        }

        logger.info(
          `[${this.name}] Triggered ${triggeredTaskIds.length} execution agents for Wave ${waveNumber}`
        );
      }

      // Step 8: Build breakdown for response
      const waveBreakdown = Array.from(wave.agentAssignments.entries()).map(
        ([agent, tasks]) => ({
          agent,
          taskCount: tasks.length,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.input.title,
            complexity: t.input.complexity,
          })),
        })
      );

      return {
        success: true,
        message: `Wave ${waveNumber} built: ${wave.tasks.length} tasks`,
        waveTasks: wave.tasks,
        triggeredTasks: triggeredTaskIds,
        waveBreakdown,
      };
    } catch (error) {
      logger.error(`[${this.name}] Wave building failed`, error);
      throw error;
    }
  }
}

// ==========================================
// EXPORT SINGLETON INSTANCE
// ==========================================

export const executionCoordinator = new ExecutionCoordinator();
