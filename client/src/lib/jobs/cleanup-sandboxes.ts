// src/lib/jobs/cleanup-sandboxes.ts
import prisma from "@/lib/prisma";
import { SandboxService } from "@/lib/services/sandbox-service";
import { logger } from "@/lib/logger";

// Configuration: Stop containers idle for 2 hours
const INACTIVITY_THRESHOLD_MINUTES = 60 * 2;

/**
 * Finds and stops sandbox containers that have been idle longer than the threshold.
 * Intended to be triggered by a scheduled job (e.g., Vercel Cron).
 */
export async function stopIdleSandboxes() {
  const jobStartTime = Date.now();
  logger.info("[IdleSandboxCleanup] Starting job...");

  const cutoffTime = new Date();
  cutoffTime.setMinutes(cutoffTime.getMinutes() - INACTIVITY_THRESHOLD_MINUTES);

  try {
    const idleProjects = await prisma.landingPage.findMany({
      where: {
        sandboxContainerId: { not: null },
        sandboxLastAccessedAt: { lt: cutoffTime },
      },
      select: {
        id: true,
        userId: true,
        sandboxContainerId: true,
        sandboxLastAccessedAt: true,
      },
      take: 50, // Limit batch size per run
    });

    if (idleProjects.length === 0) {
      logger.info("[IdleSandboxCleanup] No idle sandboxes found.");
      return { stoppedCount: 0, errors: 0 };
    }

    logger.info(
      `[IdleSandboxCleanup] Found ${idleProjects.length} idle sandboxes to process.`
    );
    let stoppedCount = 0;
    let errorCount = 0;

    // Process stops concurrently for efficiency
    const stopPromises = idleProjects.map(async (project) => {
      try {
        logger.info(
          `[IdleSandboxCleanup] Stopping sandbox for project ${project.id} (Container: ${project.sandboxContainerId})`
        );
        const success = await SandboxService.stopSandbox(
          project.id,
          project.userId
        );
        if (success) {
          stoppedCount++;
          logger.info(
            `[IdleSandboxCleanup] Successfully stopped sandbox for project ${project.id}`
          );
        } else {
          errorCount++;
          logger.error(
            `[IdleSandboxCleanup] SandboxService reported failure stopping sandbox for project ${project.id}.`
          );
        }
      } catch (error) {
        errorCount++;
        logger.error(
          `[IdleSandboxCleanup] Exception stopping sandbox for project ${project.id}:`,
          error
        );
      }
    });

    await Promise.all(stopPromises); // Wait for all stop attempts to complete

    const duration = Date.now() - jobStartTime;
    logger.info(
      `[IdleSandboxCleanup] Job finished in ${duration}ms. Attempted: ${idleProjects.length}, Successfully Stopped: ${stoppedCount}, Errors: ${errorCount}.`
    );
    return { stoppedCount, errors: errorCount };
  } catch (error) {
    const duration = Date.now() - jobStartTime;
    logger.error(
      `[IdleSandboxCleanup] Job failed during query phase after ${duration}ms:`,
      error
    );
    return { stoppedCount: 0, errors: 1 };
  }
}
