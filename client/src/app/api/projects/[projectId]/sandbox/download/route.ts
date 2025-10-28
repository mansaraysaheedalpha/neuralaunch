// src/app/api/projects/[projectId]/sandbox/download/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import Docker from "dockerode";
import { logger } from "@/lib/logger";
import { Readable } from "stream"; // Use Node.js Readable for piping

// Configuration
const DOCKER_NETWORK_NAME = "neuralaunch-net";

// Utility to convert Docker's multiplexed stream to a simple Readable
function demuxDockerStream(dockerStream: NodeJS.ReadableStream): Readable {
  const outputStream = new Readable({ read() {} }); // Create a push-based Readable

  dockerStream.on("data", (chunk: Buffer) => {
    if (chunk.length <= 8) {
      // Ignore incomplete headers or small messages (likely stderr noise)
      // console.warn("[Sandbox Download] Ignoring small chunk:", chunk.toString());
      return;
    }
    const header = chunk.slice(0, 8);
    const payload = chunk.slice(8);
    const streamType = header[0]; // 1 for stdout, 2 for stderr

    if (streamType === 1) {
      // Only forward stdout (the zip data)
      outputStream.push(payload);
    } else if (streamType === 2) {
      console.error(
        "[Sandbox Download] Archiver stderr:",
        payload.toString().trim()
      );
    }
  });

  dockerStream.on("end", () => {
    outputStream.push(null); // Signal end of stream
  });

  dockerStream.on("error", (err) => {
    outputStream.emit("error", err); // Forward errors
  });

  return outputStream;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let docker: Docker;
  let archiveContainer: Docker.Container | null = null;
  const { projectId } = await params;
  const volumeName = `neuralaunch_workspace_${projectId}`; // Consistent volume naming
  const containerName = `neuralaunch-archiver-${projectId}-${Date.now()}`;

  try {
    // 1. Authentication & Authorization
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { id: true },
    });
    if (!project) {
      return new NextResponse("Forbidden or Not Found", { status: 403 });
    }

    logger.info(`[Sandbox Download] Request received for project ${projectId}`);

    // 2. Connect to Docker & Verify Volume
    try {
      docker = new Docker({
        socketPath: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
      });
      await docker.ping();
    } catch (dockerError: unknown) {
      logger.error(
        "[Sandbox Download] Failed to connect to Docker daemon:",
        dockerError instanceof Error ? dockerError : new Error(String(dockerError))
      );
      return new NextResponse(
        "Internal Server Error: Docker connection failed",
        { status: 500 }
      );
    }

    try {
      await docker.getVolume(volumeName).inspect();
      logger.debug(`[Sandbox Download] Verified volume exists: ${volumeName}`);
    } catch (volError: unknown) {
      if (volError && typeof volError === 'object' && 'statusCode' in volError && (volError as { statusCode: number }).statusCode === 404) {
        logger.warn(
          `[Sandbox Download] Volume ${volumeName} not found for project ${projectId}.`
        );
        return new NextResponse("No sandbox data found to download.", {
          status: 404,
        });
      }
      logger.error(
        `[Sandbox Download] Error inspecting volume ${volumeName}:`,
        volError instanceof Error ? volError : undefined
      );
      throw volError;
    }

    // 3. Create and Start Temporary Archival Container
    logger.debug(
      `[Sandbox Download] Creating temporary archive container ${containerName}`
    );
    archiveContainer = await docker.createContainer({
      Image: "alpine:latest",
      Cmd: [
        "sh",
        "-c",
        "apk add --no-cache zip && cd /workspace && zip -q -r - /.",
      ], // -q quiet zip
      Labels: {
        "neuralaunch.temp": "true",
        "neuralaunch.projectId": projectId,
      },
      HostConfig: {
        AutoRemove: true,
        Mounts: [
          {
            Type: "volume",
            Source: volumeName,
            Target: "/workspace",
            ReadOnly: true,
          },
        ],
      },
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: false,
      name: containerName,
    });

    const dockerStream = await archiveContainer.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });
    await archiveContainer.start();
    logger.info(
      `[Sandbox Download] Archive container ${containerName} started. Streaming response...`
    );

    // 4. Stream Response
    const responseStream = demuxDockerStream(dockerStream);

    // Optional: Wait briefly for container exit code to catch fast failures
    archiveContainer
      .wait({ condition: "removed" })
      .then((result: { StatusCode: number }) => {
        if (result.StatusCode !== 0) {
          logger.error(
            `[Sandbox Download] Archiver container ${containerName} exited with code ${result.StatusCode}. Stream may be incomplete.`
          );
          // We can't easily interrupt the stream here, but we log the error.
        } else {
          logger.info(
            `[Sandbox Download] Archiver container ${containerName} completed successfully.`
          );
        }
      })
      .catch((waitError: unknown) => {
        logger.error(
          `[Sandbox Download] Error waiting for archiver container ${containerName}:`,
          waitError instanceof Error ? waitError : undefined
        );
      });

    return new NextResponse(responseStream as unknown as BodyInit, {
      // Cast needed for NextResponse type
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${projectId}_workspace.zip"`,
        "Transfer-Encoding": "chunked", // Important for streaming
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown download error";
    logger.error(
      `[Sandbox Download API] Error for project ${projectId}: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );

    // Ensure temporary container is cleaned up on error
    if (archiveContainer) {
      logger.warn(
        `[Sandbox Download] Attempting cleanup of archiver container ${containerName} after error.`
      );
      archiveContainer
        .remove({ force: true })
        .catch((rmErr: unknown) =>
          logger.error(
            `Error force removing archiver ${containerName} on cleanup:`,
            rmErr instanceof Error ? rmErr : undefined
          )
        );
    }

    return new NextResponse(
      JSON.stringify({ error: "Internal Server Error", message: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
