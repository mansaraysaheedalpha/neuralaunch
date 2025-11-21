//src/inngest/functions/cleanup-stuck-tasks.ts
import { inngest } from "../client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * WATCHDOG: Cleanup Stuck Tasks
 * Runs every 10 minutes to check for tasks that have been 'in_progress'
 * for more than 30 minutes (Zombie Tasks).
 */
export const cleanupStuckTasks = inngest.createFunction(
  { id: "cleanup-stuck-tasks", name: "Watchdog: Cleanup Stuck Tasks" },
  { cron: "*/10 * * * *" }, // Run every 10 minutes
  async ({ step }) => {
    const STUCK_THRESHOLD_MINUTES = 30;
    const cutoffDate = new Date(
      Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000
    );

    const log = logger.child({ module: "Watchdog" });

    // Step 1: Find stuck tasks
    const stuckTasks = await step.run("find-stuck-tasks", async () => {
      return await prisma.agentTask.findMany({
        where: {
          status: "in_progress",
          startedAt: {
            lt: cutoffDate, // Started more than 30 mins ago
          },
        },
        select: {
          id: true,
          projectId: true,
          agentName: true,
          waveNumber: true,
        },
        take: 50, // Process in batches
      });
    });

    if (stuckTasks.length === 0) {
      log.info("No stuck tasks found. System healthy.");
      return { cleaned: 0 };
    }

    log.warn(`Found ${stuckTasks.length} stuck tasks. initiating cleanup.`);

    // Step 2: Fail them
    const result = await step.run("fail-stuck-tasks", async () => {
      const results = [];

      for (const task of stuckTasks) {
        // Mark task as failed
        await prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            error: "Watchdog: Execution timed out (Zombie Task)",
            completedAt: new Date(),
          },
        });

        // If it belongs to a wave, mark the wave as failed too
        if (task.waveNumber && task.projectId) {
          try {
            await prisma.executionWave.update({
              where: {
                projectId_waveNumber: {
                  projectId: task.projectId,
                  waveNumber: task.waveNumber,
                },
              },
              data: { status: "failed" },
            });
          } catch {
            // Wave might not exist or already be failed, ignore
          }
        }

        results.push(task.id);
      }
      return results;
    });

    return { cleaned: result.length, taskIds: result };
  }
);
