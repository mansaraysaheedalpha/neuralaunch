// src/inngest/functions/optimization-agent-function.ts
/**
 * Optimization Agent Inngest Function
 * Triggered to apply monitoring recommendations automatically
 *
 * Trigger Points:
 * 1. After monitoring detects issues with recommendations
 * 2. Manual trigger from dashboard
 * 3. Scheduled optimization runs
 */

import { inngest } from "../client";
import { optimizationAgent } from "@/lib/agents/optimization/optimization-agent";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { TechStack } from "@/lib/agents/types/common";
import { createAgentError } from "@/lib/error-utils";
import { sendNotification } from "@/lib/notifications/notification-service";

interface OptimizationTaskInput {
  recommendations?: Array<{
    priority?: string;
    [key: string]: unknown;
  }>;
  deploymentUrl?: string;
  autoApply?: boolean;
  maxOptimizations?: number;
  autoRedeploy?: boolean;
  verifyImprovements?: boolean;
}

export const optimizationAgentFunction = inngest.createFunction(
  {
    id: "optimization-agent-apply",
    name: "Optimization Agent - Apply Performance Improvements",
    retries: 1, // Only retry once
  },
  { event: "agent/optimization.start" },
  async ({ event, step }) => {
    const eventData = event.data as {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId?: string;
      taskInput: OptimizationTaskInput;
    };
    const { taskId, projectId, userId, conversationId, taskInput } = eventData;

    logger.info(`[Inngest] Optimization Agent triggered`, {
      taskId,
      projectId,
      recommendations: taskInput.recommendations?.length ?? 0,
    });

    // Step 1: Get project context
    const projectContext = await step.run("get-project-context", async () => {
      return await prisma.projectContext.findUnique({
        where: { projectId },
        select: {
          techStack: true,
          architecture: true,
        },
      });
    });

    if (!projectContext) {
      throw new Error(`Project context not found for ${projectId}`);
    }

    // Step 2: Validate recommendations
    const recommendations = taskInput.recommendations || [];

    if (recommendations.length === 0) {
      logger.warn(
        `[Inngest] No recommendations provided, skipping optimization`
      );

      await inngest.send({
        name: "agent/optimization.complete",
        data: {
          taskId,
          projectId,
          success: true,
          message: "No recommendations to apply",
          tasksCompleted: 0,
        },
      });

      return {
        success: true,
        message: "No recommendations to apply",
        tasksCompleted: 0,
      };
    }

    // Step 3: Create optimization task
    const task = await step.run("create-optimization-task", async () => {
      return await prisma.agentTask.create({
        data: {
          projectId,
          agentName: "OptimizationAgent",
          status: "in_progress",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion
          input: JSON.parse(JSON.stringify({
            recommendations,
            deploymentUrl: taskInput.deploymentUrl ?? null,
            autoApply: taskInput.autoApply !== false, // Default true
            maxOptimizations: taskInput.maxOptimizations ?? 10,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any,
          startedAt: new Date(),
        },
      });
    });

    // Step 4: Execute Optimization Agent
    const result = await step.run("apply-optimizations", async () => {
      return await optimizationAgent.execute({
        taskId: task.id,
        projectId,
        userId,
        conversationId: conversationId ?? "",
        taskDetails: {
          title: "Performance Optimization",
          description: "Apply monitoring recommendations",
          complexity: "medium",
          estimatedLines: 0,
          recommendations,
          deploymentUrl: taskInput.deploymentUrl,
          autoApply: taskInput.autoApply !== false,
          maxOptimizations: taskInput.maxOptimizations || 10,
        },
        context: {
          techStack: projectContext.techStack as TechStack | undefined,
          architecture: projectContext.architecture,
        },
      });
    });

    // Step 5: Handle optimization result
    if (!result.success) {
      logger.error(`[Inngest] Optimization failed`, createAgentError(result.error || "Unknown error", { taskId: task.id }));

      await step.run("mark-task-failed", async () => {
        await prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            error: result.error,
            completedAt: new Date(),
          },
        });
      });

      // Send failure event
      await inngest.send({
        name: "agent/optimization.complete",
        data: {
          taskId: task.id,
          projectId,
          success: false,
          error: result.error,
        },
      });

      return {
        success: false,
        message: result.message,
        error: result.error,
      };
    }

    // Step 6: Extract optimization results
    const optimizationResult = result.data as { tasksCompleted?: number; tasksFailed?: number; filesModified?: unknown[]; estimatedImpact?: { performanceImprovement?: number; costReduction?: number }; summary?: string; [key: string]: unknown } | undefined;
    const tasksCompleted = optimizationResult?.tasksCompleted || 0;
    const tasksFailed = optimizationResult?.tasksFailed || 0;
    const filesModified = optimizationResult?.filesModified || [];

    logger.info(`[Inngest] Optimization complete`, {
      taskId: task.id,
      completed: tasksCompleted,
      failed: tasksFailed,
      filesModified: filesModified.length,
    });

    // Step 7: Update task status
    await step.run("update-task-status", async () => {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: "completed",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion
          output: optimizationResult ? (JSON.parse(JSON.stringify(optimizationResult)) as any) : null,
          completedAt: new Date(),
        },
      });
    });

    // Step 8: Trigger re-deployment if changes were applied
    if (filesModified.length > 0 && taskInput.autoRedeploy !== false) {
      await step.run("trigger-redeployment", async () => {
        logger.info(`[Inngest] Triggering re-deployment after optimization`);

        await inngest.send({
          name: "agent/deployment.deploy",
          data: {
            taskId: `deploy-after-optimization-${Date.now()}`,
            projectId,
            userId,
            conversationId: conversationId ?? "",
            environment: "production" as const,
            taskInput: {
              environment: "production",
              runMigrations: false, // Don't run migrations for optimization
            },
          },
        });
      });
    }

    // Step 9: Trigger monitoring to verify improvements
    if (filesModified.length > 0 && taskInput.verifyImprovements !== false) {
      await step.run("verify-improvements", async () => {
        // Wait a bit for deployment to complete
        await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 seconds

        logger.info(`[Inngest] Triggering monitoring to verify improvements`);

        await inngest.send({
          name: "agent/monitoring.start",
          data: {
            taskId: `monitoring-after-optimization-${Date.now()}`,
            projectId,
            userId,
            conversationId: conversationId ?? "",
            taskInput: {
              deploymentUrl: taskInput.deploymentUrl,
              monitoringDuration: 5, // 5 minutes
              checkInterval: 30,
              comparisonTaskId: task.id, // Compare with this optimization
            },
          },
        });
      });
    }

    // Step 10: Store optimization metrics for comparison
    await step.run("store-optimization-metrics", async () => {
      try {
        // Store before/after metrics
        // This would be used to compare performance before and after optimization
        await prisma.$executeRaw`
          INSERT INTO optimization_metrics (
            project_id,
            optimization_task_id,
            recommendations_applied,
            files_modified,
            estimated_performance_improvement,
            estimated_cost_reduction,
            applied_at
          ) VALUES (
            ${projectId},
            ${task.id},
            ${tasksCompleted},
            ${filesModified.length},
            ${optimizationResult?.estimatedImpact?.performanceImprovement || null},
            ${optimizationResult?.estimatedImpact?.costReduction || null},
            NOW()
          )
        `;

        logger.info(`[Inngest] Stored optimization metrics`, {
          taskId: task.id,
        });
      } catch (error) {
        logger.warn(`[Inngest] Failed to store optimization metrics`, {
          error,
        });
        // Don't fail the task if metrics storage fails
      }
    });

    // Step 11: Send completion event
    await step.run("send-completion-event", async () => {
      await inngest.send({
        name: "agent/optimization.complete",
        data: {
          taskId: task.id,
          projectId,
          deploymentUrl: taskInput.deploymentUrl,
          success: true,
          tasksCompleted,
          tasksFailed,
          filesModified: filesModified.length,
          estimatedImpact: optimizationResult?.estimatedImpact,
          summary: optimizationResult?.summary,
        },
      });
    });

    // Step 12: Notify user of optimization results
    if (tasksCompleted > 0 && userId) {
      await step.run("notify-user", async () => {
        try {
          await sendNotification({
            userId,
            projectId,
            type: "optimization_complete",
            priority: "low",
            title: "Optimization Complete",
            message: `${tasksCompleted} optimization${tasksCompleted > 1 ? 's' : ''} applied successfully`,
            optimizationsApplied: tasksCompleted,
            performanceGain: optimizationResult?.estimatedImpact 
              ? `${optimizationResult.estimatedImpact.performanceImprovement || 0}% performance, ${optimizationResult.estimatedImpact.costReduction || 0}% cost reduction`
              : undefined,
          });
          logger.info(`[Inngest] Optimization notification sent`, { tasksCompleted });
        } catch (error) {
          logger.error(`[Inngest] Failed to send optimization notification`, createAgentError(error));
        }
      });
    }

    return {
      success: true,
      message: result.message,
      tasksCompleted,
      tasksFailed,
      filesModified: filesModified.length,
      estimatedImpact: optimizationResult?.estimatedImpact,
    };
  }
);

/**
 * Scheduled optimization function (weekly)
 * Automatically checks for optimization opportunities
 */
export const scheduledOptimizationFunction = inngest.createFunction(
  {
    id: "scheduled-optimization-check",
    name: "Scheduled Optimization - Weekly Optimization Check",
  },
  { cron: "0 0 * * 0" }, // Every Sunday at midnight
  async ({ step }) => {
    logger.info(`[Inngest] Running scheduled optimization check`);

    // Step 1: Get all active projects with recent monitoring data
    const projectsWithMonitoring = await step.run(
      "get-projects-for-optimization",
      async () => {
        // Get projects that have been monitored in the last 7 days
        // and have optimization recommendations
        const recentMonitoring = await prisma.agentTask.findMany({
          where: {
            agentName: "MonitoringAgent",
            status: "completed",
            completedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          select: {
            projectId: true,
            output: true,
          },
        });

        // Filter projects with recommendations
        return recentMonitoring.filter((monitoring) => {
          const output = monitoring.output as {
            recommendations?: Array<{ priority?: string }>;
          } | null;
          const recommendations = output?.recommendations ?? [];
          const highPriorityRecs = recommendations.filter(
            (r) => r.priority === "high"
          );
          return highPriorityRecs.length > 0;
        });
      }
    );

    logger.info(
      `[Inngest] Found ${projectsWithMonitoring.length} projects with optimization opportunities`
    );

    // Step 2: Trigger optimization for each project
    for (const project of projectsWithMonitoring) {
      await step.run(`optimize-${project.projectId}`, async () => {
        const output = project.output as {
          recommendations?: Array<{ priority?: string; [key: string]: unknown }>;
        } | null;
        const recommendations = output?.recommendations ?? [];
        const highPriorityRecs = recommendations.filter(
          (r) => r.priority === "high"
        );

        await inngest.send({
          name: "agent/optimization.start",
          data: {
            taskId: `optimization-scheduled-${Date.now()}`,
            projectId: project.projectId,
            userId: "", // System user for scheduled tasks
            conversationId: "",
            taskInput: {
              recommendations: highPriorityRecs,
              autoApply: false, // Create PR for review instead of auto-applying
              maxOptimizations: 5, // Limit to 5 optimizations per week
              autoRedeploy: false, // Don't auto-deploy scheduled optimizations
            },
          },
        });

        logger.info(
          `[Inngest] Triggered optimization for project ${project.projectId}`
        );
      });
    }

    return {
      success: true,
      projectsOptimized: projectsWithMonitoring.length,
    };
  }
);
