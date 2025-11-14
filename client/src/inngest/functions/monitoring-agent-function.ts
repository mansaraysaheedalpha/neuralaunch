// src/inngest/functions/monitoring-agent-function.ts
/**
 * Monitoring Agent Inngest Function
 * Triggered to monitor deployed application health and performance
 *
 * Trigger Points:
 * 1. After successful deployment
 * 2. Scheduled continuous monitoring (cron)
 * 3. Manual trigger from dashboard
 */

import { inngest } from "../client";
import { monitoringAgent } from "@/lib/agents/monitoring/monitoring-agent";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createAgentError } from "@/lib/error-utils";
import { sendNotification } from "@/lib/notifications/notification-service";

export const monitoringAgentFunction = inngest.createFunction(
  {
    id: "monitoring-agent-health-check",
    name: "Monitoring Agent - Health & Performance Monitoring",
    retries: 1, // Don't retry monitoring failures
  },
  { event: "agent/monitoring.start" },
  async ({ event, step }) => {
    const { taskId, projectId, userId, conversationId, taskInput } = event.data;

    logger.info(`[Inngest] Monitoring Agent triggered`, {
      taskId,
      projectId,
      deploymentUrl: taskInput.deploymentUrl,
      duration: taskInput.monitoringDuration || 5,
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

    // Step 2: Validate deployment URL
    if (!taskInput.deploymentUrl) {
      throw new Error("Deployment URL is required for monitoring");
    }

    // Step 3: Create monitoring task
    const task = await step.run("create-monitoring-task", async () => {
      return await prisma.agentTask.create({
        data: {
          projectId,
          agentName: "MonitoringAgent",
          status: "in_progress",
          input: {
            deploymentUrl: taskInput.deploymentUrl,
            monitoringDuration: taskInput.monitoringDuration || 5,
            endpoints: taskInput.endpoints || [],
            checkInterval: taskInput.checkInterval || 30,
          },
          startedAt: new Date(),
        },
      });
    });

    // Step 4: Execute Monitoring Agent
    const result = await step.run("monitor-application", async () => {
      return await monitoringAgent.execute({
        taskId: task.id,
        projectId,
        userId,
        conversationId,
        taskDetails: {
          title: "Application Monitoring",
          description: "Monitor application health and performance",
          complexity: "simple",
          estimatedLines: 0,
          deploymentUrl: taskInput.deploymentUrl,
          monitoringDuration: taskInput.monitoringDuration || 5,
          endpoints: taskInput.endpoints || [],
          checkInterval: taskInput.checkInterval || 30,
        },
        context: {
          techStack: projectContext.techStack,
          architecture: projectContext.architecture,
        },
      });
    });

    // Step 5: Handle monitoring result
    if (!result.success) {
      logger.error(`[Inngest] Monitoring failed`, createAgentError(result.error || "Unknown error", { taskId: task.id }));

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
        name: "agent/monitoring.complete",
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

    // Step 6: Extract monitoring results
    const report = result.data;
    const healthStatus = report?.healthStatus || "unknown";
    const uptime = report?.uptime || 0;
    const alerts = report?.alerts || [];
    const criticalAlerts = alerts.filter((a: any) => a.severity === "critical");

    logger.info(`[Inngest] Monitoring complete`, {
      taskId: task.id,
      healthStatus,
      uptime: `${uptime.toFixed(2)}%`,
      totalAlerts: alerts.length,
      criticalAlerts: criticalAlerts.length,
    });

    // Step 7: Update task status
    await step.run("update-task-status", async () => {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: "completed",
          output: report,
          completedAt: new Date(),
        },
      });
    });

    // Step 8: Handle critical alerts
    if (criticalAlerts.length > 0) {
      await step.run("handle-critical-alerts", async () => {
        logger.warn(
          `[Inngest] ${criticalAlerts.length} critical alerts detected`,
          {
            taskId: task.id,
            projectId,
          }
        );

        // Send alert notifications
        if (userId && criticalAlerts.length > 0) {
          try {
            const alertMessages = criticalAlerts.map((a: any) => a.message).join(', ');
            await sendNotification({
              userId,
              projectId,
              type: "monitoring_alert",
              priority: healthStatus === "down" ? "critical" : "high",
              title: `Monitoring Alert: ${healthStatus.toUpperCase()}`,
              message: `${criticalAlerts.length} critical alert${criticalAlerts.length > 1 ? 's' : ''} detected`,
              alertType: "health_check",
              severity: healthStatus === "down" ? "critical" : "error",
              metrics: {
                healthStatus,
                criticalAlerts: criticalAlerts.length,
                alerts: alertMessages,
              },
            });
            logger.info(`[Inngest] Monitoring alert notification sent`);
          } catch (error) {
            logger.error(`[Inngest] Failed to send monitoring alert`, createAgentError(error));
          }
        }

        // Create incident if needed
        if (healthStatus === "down") {
          await prisma.agentTask.create({
            data: {
              projectId,
              agentName: "IncidentResponse",
              status: "pending",
              input: {
                type: "critical_incident",
                healthStatus,
                alerts: criticalAlerts,
                deploymentUrl: taskInput.deploymentUrl,
              },
            },
          });
        }
      });
    }

    // Step 9: Store monitoring metrics (for historical tracking)
    await step.run("store-metrics", async () => {
      try {
        // Store metrics in time-series format
        // This would typically go to a metrics database like InfluxDB, Prometheus, etc.
        // For now, we'll store in the main database

        const metrics = report?.performanceMetrics || [];
        const healthChecks = report?.healthChecks || [];

        // Calculate aggregated metrics
        const avgResponseTime = metrics.find(
          (m: any) => m.metric === "average_response_time"
        );
        const errorRate = metrics.find((m: any) => m.metric === "error_rate");

        // Store snapshot
        await prisma.$executeRaw`
          INSERT INTO monitoring_snapshots (
            project_id,
            deployment_url,
            health_status,
            uptime,
            avg_response_time,
            error_rate,
            total_checks,
            failed_checks,
            critical_alerts,
            timestamp
          ) VALUES (
            ${projectId},
            ${taskInput.deploymentUrl},
            ${healthStatus},
            ${uptime},
            ${avgResponseTime?.value || 0},
            ${errorRate?.value || 0},
            ${healthChecks.length},
            ${healthChecks.filter((hc: any) => hc.status === "down").length},
            ${criticalAlerts.length},
            NOW()
          )
        `;

        logger.info(`[Inngest] Stored monitoring snapshot`, {
          taskId: task.id,
        });
      } catch (error) {
        logger.warn(`[Inngest] Failed to store metrics`, { error });
        // Don't fail the task if metrics storage fails
      }
    });

    // Step 10: Schedule next monitoring run (for continuous monitoring)
    if (taskInput.continuousMonitoring) {
      await step.run("schedule-next-monitoring", async () => {
        const nextRunDelay = (taskInput.monitoringInterval || 300) * 1000; // Default 5 minutes

        await inngest.send({
          name: "agent/monitoring.start",
          data: {
            taskId: `monitoring-${Date.now()}`,
            projectId,
            userId,
            conversationId,
            taskInput: {
              deploymentUrl: taskInput.deploymentUrl,
              monitoringDuration: taskInput.monitoringDuration || 5,
              endpoints: taskInput.endpoints || [],
              checkInterval: taskInput.checkInterval || 30,
              continuousMonitoring: true,
              monitoringInterval: taskInput.monitoringInterval || 300,
            },
          },
        });

        logger.info(
          `[Inngest] Scheduled next monitoring run in ${nextRunDelay / 1000}s`
        );
      });
    }

    // Step 11: Send completion event
    await step.run("send-completion-event", async () => {
      await inngest.send({
        name: "agent/monitoring.complete",
        data: {
          taskId: task.id,
          projectId,
          deploymentUrl: taskInput.deploymentUrl,
          success: true,
          healthStatus,
          uptime,
          totalAlerts: alerts.length,
          criticalAlerts: criticalAlerts.length,
          recommendations: report?.recommendations?.length || 0,
          summary: report?.summary || "",
        },
      });
    });

    // Step 12: Trigger optimization if recommendations available
    if (report?.recommendations && report.recommendations.length > 0) {
      const highPriorityRecs = report.recommendations.filter(
        (r: any) => r.priority === "high"
      );

      if (highPriorityRecs.length > 0 && taskInput.autoOptimize) {
        await step.run("trigger-optimization", async () => {
          await inngest.send({
            name: "agent/optimization.start",
            data: {
              taskId: `optimization-${Date.now()}`,
              projectId,
              userId,
              conversationId,
              taskInput: {
                deploymentUrl: taskInput.deploymentUrl,
                recommendations: highPriorityRecs,
              },
            },
          });

          logger.info(`[Inngest] Triggered optimization agent`, {
            recommendations: highPriorityRecs.length,
          });
        });
      }
    }

    return {
      success: true,
      message: result.message,
      healthStatus,
      uptime: `${uptime.toFixed(2)}%`,
      totalAlerts: alerts.length,
      criticalAlerts: criticalAlerts.length,
    };
  }
);

/**
 * Continuous monitoring function (cron-based)
 */
export const continuousMonitoringFunction = inngest.createFunction(
  {
    id: "continuous-monitoring-cron",
    name: "Continuous Monitoring - Scheduled Health Checks",
  },
  { cron: "*/5 * * * *" }, // Every 5 minutes
  async ({ step }) => {
    logger.info(`[Inngest] Running scheduled monitoring checks`);

    // Step 1: Get all active deployments
    const activeProjects = await step.run(
      "get-active-deployments",
      async () => {
        // Get projects with active deployments from the Deployment table
        const deployments = await prisma.deployment.findMany({
          where: {
            status: "deployed",
            deploymentUrl: { not: null }
          },
          select: {
            projectId: true,
            deploymentUrl: true,
          },
          distinct: ['projectId'], // Get one deployment per project
        });

        // Get user info for each project
        const projectsWithUsers = await Promise.all(
          deployments.map(async (deployment) => {
            const context = await prisma.projectContext.findUnique({
              where: { projectId: deployment.projectId },
              select: { userId: true },
            });
            return {
              projectId: deployment.projectId,
              userId: context?.userId || '',
              deploymentUrl: deployment.deploymentUrl,
            };
          })
        );

        return projectsWithUsers.filter(p => p.userId); // Filter out projects without userId
      }
    );

    logger.info(
      `[Inngest] Found ${activeProjects.length} active deployments to monitor`
    );

    // Step 2: Trigger monitoring for each deployment
    for (const project of activeProjects) {
      await step.run(`monitor-${project.projectId}`, async () => {
        await inngest.send({
          name: "agent/monitoring.start",
          data: {
            taskId: `monitoring-cron-${Date.now()}`,
            projectId: project.projectId,
            userId: project.userId,
            conversationId: "", // No conversation for cron jobs
            taskInput: {
              deploymentUrl: project.deploymentUrl,
              monitoringDuration: 5, // 2 minutes for cron checks
              checkInterval: 30,
              continuousMonitoring: false, // Cron handles scheduling
            },
          },
        });
      });
    }

    return {
      success: true,
      monitored: activeProjects.length,
    };
  }
);
