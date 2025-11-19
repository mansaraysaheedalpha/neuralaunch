// src/app/api/debug/cleanup-all-containers/route.ts
/**
 * EMERGENCY CLEANUP ENDPOINT
 * Removes ALL neuralaunch sandbox containers and volumes from Docker host
 * Use this when Docker host is overwhelmed with orphaned containers
 */
import { NextResponse } from "next/server";
import Docker from "dockerode";
import { env } from "@/lib/env";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

const IS_PRODUCTION = env.NODE_ENV === "production";

// Production Docker configuration
const prodDockerHost = env.DOCKER_HOST_URL?.split("://")[1]?.split(":")[0] || "";
const prodDockerPort = env.DOCKER_HOST_URL?.split(":")[2] || "2376";
const prodDockerCACert = env.DOCKER_CA_CERT || "";
const prodDockerClientCert = env.DOCKER_CLIENT_CERT || "";
const prodDockerClientKey = env.DOCKER_CLIENT_KEY || "";

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

    logger.info("[CleanupAPI] Starting emergency container cleanup");

    // Get ALL containers (running and stopped) with neuralaunch label
    const allContainers = await docker.listContainers({
      all: true,
      filters: {
        label: ["neuralaunch.projectId"],
      },
    });

    logger.info(`[CleanupAPI] Found ${allContainers.length} neuralaunch containers to clean up`);

    const results = {
      containersFound: allContainers.length,
      containersStopped: 0,
      containersRemoved: 0,
      volumesRemoved: 0,
      errors: [] as string[],
    };

    // Stop and remove each container
    for (const containerInfo of allContainers) {
      const container = docker.getContainer(containerInfo.Id);
      const shortId = containerInfo.Id.substring(0, 12);

      try {
        // Stop if running
        if (containerInfo.State === "running") {
          logger.info(`[CleanupAPI] Stopping container ${shortId}`);
          await container.stop({ t: 10 }); // 10 second timeout
          results.containersStopped++;
        }

        // Remove container
        logger.info(`[CleanupAPI] Removing container ${shortId}`);
        await container.remove({ force: true, v: false }); // Don't remove volumes yet
        results.containersRemoved++;
      } catch (error) {
        const errorMsg = `Failed to remove container ${shortId}: ${error instanceof Error ? error.message : "Unknown error"}`;
        logger.error(`[CleanupAPI] ${errorMsg}`);
        results.errors.push(errorMsg);
      }
    }

    // Now remove volumes (after all containers are gone)
    logger.info("[CleanupAPI] Cleaning up neuralaunch volumes");
    const volumes = await docker.listVolumes({
      filters: {
        name: ["neuralaunch_workspace_"],
      },
    });

    const volumeList = volumes.Volumes || [];
    logger.info(`[CleanupAPI] Found ${volumeList.length} neuralaunch volumes`);

    for (const volumeInfo of volumeList) {
      if (!volumeInfo.Name) continue;

      try {
        const volume = docker.getVolume(volumeInfo.Name);
        logger.info(`[CleanupAPI] Removing volume ${volumeInfo.Name}`);
        await volume.remove();
        results.volumesRemoved++;
      } catch (error) {
        const errorMsg = `Failed to remove volume ${volumeInfo.Name}: ${error instanceof Error ? error.message : "Unknown error"}`;
        logger.error(`[CleanupAPI] ${errorMsg}`);
        results.errors.push(errorMsg);
      }
    }

    // Clear all sandbox records from database
    logger.info("[CleanupAPI] Clearing database sandbox records");
    await prisma.landingPage.updateMany({
      where: {
        sandboxContainerId: {
          not: null,
        },
      },
      data: {
        sandboxContainerId: null,
        sandboxInternalIp: null,
        sandboxHostPort: null,
      },
    });

    logger.info("[CleanupAPI] Cleanup completed", results);

    return NextResponse.json({
      success: true,
      message: "Cleanup completed",
      results,
    });
  } catch (error) {
    logger.error("[CleanupAPI] Fatal error during cleanup", error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
