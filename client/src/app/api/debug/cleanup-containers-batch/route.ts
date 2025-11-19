// src/app/api/debug/cleanup-containers-batch/route.ts
/**
 * FAST BATCH CLEANUP ENDPOINT
 * Removes containers in parallel batches - much faster than sequential
 * Run this multiple times until all containers are gone
 */
import { NextResponse } from "next/server";
import Docker from "dockerode";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const IS_PRODUCTION = env.NODE_ENV === "production";

// Production Docker configuration
const prodDockerHost = env.DOCKER_HOST_URL?.split("://")[1]?.split(":")[0] || "";
const prodDockerPort = env.DOCKER_HOST_URL?.split(":")[2] || "2376";
const prodDockerCACert = env.DOCKER_CA_CERT || "";
const prodDockerClientCert = env.DOCKER_CLIENT_CERT || "";
const prodDockerClientKey = env.DOCKER_CLIENT_KEY || "";

const BATCH_SIZE = 30; // Remove 30 containers per run

export async function POST() {
  try {
    // Initialize Docker client
    let docker: Docker;

    if (IS_PRODUCTION) {
      if (!prodDockerCACert || !prodDockerClientCert || !prodDockerClientKey) {
        return NextResponse.json(
          {
            success: false,
            error: "Docker TLS certificates not configured",
          },
          { status: 500 }
        );
      }

      docker = new Docker({
        host: prodDockerHost,
        port: parseInt(prodDockerPort),
        ca: Buffer.from(prodDockerCACert.replace(/\\n/g, "\n")),
        cert: Buffer.from(prodDockerClientCert.replace(/\\n/g, "\n")),
        key: Buffer.from(prodDockerClientKey.replace(/\\n/g, "\n")),
      });
    } else {
      docker = new Docker();
    }

    logger.info("[BatchCleanupAPI] Starting fast batch container cleanup");

    // Get ALL containers (running and stopped) with neuralaunch label
    const allContainers = await docker.listContainers({
      all: true,
      filters: {
        label: ["neuralaunch.projectId"],
      },
    });

    logger.info(`[BatchCleanupAPI] Found ${allContainers.length} total neuralaunch containers`);

    // Take only first BATCH_SIZE containers
    const batch = allContainers.slice(0, BATCH_SIZE);
    const remaining = allContainers.length - batch.length;

    logger.info(`[BatchCleanupAPI] Processing batch of ${batch.length} containers (${remaining} remaining)`);

    const results = {
      totalFound: allContainers.length,
      batchSize: batch.length,
      remaining: remaining,
      removed: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Remove containers in parallel for speed
    const removePromises = batch.map(async (containerInfo) => {
      const container = docker.getContainer(containerInfo.Id);
      const shortId = containerInfo.Id.substring(0, 12);

      try {
        // Force remove (stops if running, then removes)
        logger.info(`[BatchCleanupAPI] Force removing container ${shortId}`);
        await container.remove({ force: true, v: true }); // Also remove anonymous volumes
        results.removed++;
        return { success: true, id: shortId };
      } catch (error) {
        const errorMsg = `Failed to remove ${shortId}: ${error instanceof Error ? error.message : "Unknown"}`;
        logger.error(`[BatchCleanupAPI] ${errorMsg}`);
        results.failed++;
        results.errors.push(errorMsg);
        return { success: false, id: shortId, error: errorMsg };
      }
    });

    // Wait for all removals to complete (in parallel)
    await Promise.all(removePromises);

    logger.info("[BatchCleanupAPI] Batch cleanup completed", results);

    return NextResponse.json({
      success: true,
      message: remaining > 0
        ? `Removed ${results.removed}/${batch.length} containers. Run again to remove ${remaining} more.`
        : `All containers cleaned! Removed ${results.removed}/${batch.length}.`,
      results,
      runAgain: remaining > 0,
    });
  } catch (error) {
    logger.error("[BatchCleanupAPI] Fatal error during cleanup", error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
