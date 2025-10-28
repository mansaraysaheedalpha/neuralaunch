// src/lib/services/sandbox-service.ts

import Docker from "dockerode";
import prisma from "@/lib/prisma"; // Your Prisma singleton
import { sanitizeUserInput } from "@/lib/sanitize"; // Your sanitizer
import { logger } from "../logger";

// --- CONFIGURATION ---
const DOCKER_NETWORK_NAME = "neuralaunch-net"; // Ensure this network exists: `docker network create neuralaunch-net`
const SANDBOX_IMAGE_NAME = "neuralaunch-sandbox:latest"; // Ensure this image is built
const SANDBOX_INTERNAL_PORT = "8080";
const WORKSPACE_DIR_INSIDE_CONTAINER = "/workspace";

// --- TYPES ---
interface ExecResult {
  status: "success" | "error";
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface FileWriteResult {
  status: "success" | "error";
  path: string;
  size?: number;
  message?: string;
}

/**
 * Manages the lifecycle and communication with secure Docker sandboxes.
 */
class SandboxServiceClass {
  private docker: Docker;

  constructor() {
    try {
      // Prioritize socket path for Linux/macOS
      this.docker = new Docker({
        socketPath: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
      });
      console.log("[SandboxService] Connected to Docker via socket.");
    } catch (error) {
      console.warn(
        "[SandboxService] Failed to connect via socket, trying default Docker connection:",
        error.message
      );
      // Fallback might work for Docker Desktop on Windows/Mac or remote Docker hosts via DOCKER_HOST env var
      this.docker = new Docker();
    }
    this.ensureNetworkExists(); // Check if network exists on startup
  }

  /** Checks if the required Docker network exists, creates if not. */
  private async ensureNetworkExists(): Promise<void> {
    try {
      await this.docker.getNetwork(DOCKER_NETWORK_NAME).inspect();
      console.log(
        `[SandboxService] Docker network "${DOCKER_NETWORK_NAME}" found.`
      );
    } catch (error) {
      if (error.statusCode === 404) {
        console.warn(
          `[SandboxService] Docker network "${DOCKER_NETWORK_NAME}" not found. Creating...`
        );
        try {
          await this.docker.createNetwork({ Name: DOCKER_NETWORK_NAME });
          console.log(
            `[SandboxService] Docker network "${DOCKER_NETWORK_NAME}" created successfully.`
          );
        } catch (createError) {
          console.error(
            `[SandboxService] Failed to create Docker network "${DOCKER_NETWORK_NAME}":`,
            createError
          );
          throw createError; // Re-throw critical error
        }
      } else {
        console.error(
          "[SandboxService] Error inspecting Docker network:",
          error
        );
        // Don't throw here, maybe Docker daemon is just temporarily down
      }
    }
  }

  /** Executes a command inside the project's specific sandbox. */
  async execCommand(
    projectId: string,
    userId: string,
    command: string,
    timeout: number
  ): Promise<ExecResult> {
    try {
      const sandboxUrl = await this.findOrCreateSandbox(projectId, userId);
      const response = await fetch(`${sandboxUrl}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, timeout }),
        signal: AbortSignal.timeout(30000), // 30s timeout for API call itself
      });

      if (!response.ok) {
        return {
          status: "error",
          exitCode: -1,
          stdout: "",
          stderr: `Sandbox API error: ${response.status} ${response.statusText}`,
        };
      }
      return (await response.json()) as ExecResult;
    } catch (error) {
      console.error(
        `[SandboxService.execCommand] Error for project ${projectId}:`,
        error
      );
      return {
        status: "error",
        exitCode: -1,
        stdout: "",
        stderr:
          error instanceof Error
            ? error.message
            : "Network error communicating with sandbox",
      };
    }
  }

  /** Writes a file inside the project's specific sandbox. */
  async writeFile(
    projectId: string,
    userId: string,
    relativePath: string, // Expecting relative path
    content: string
  ): Promise<FileWriteResult> {
    try {
      // Basic path sanitization before sending
      if (relativePath.includes("..") || relativePath.startsWith("/")) {
        return {
          status: "error",
          path: relativePath,
          message: "Invalid path provided.",
        };
      }

      const sandboxUrl = await this.findOrCreateSandbox(projectId, userId);
      const sanitizedContent = sanitizeUserInput(content); // Sanitize using your function

      const response = await fetch(`${sandboxUrl}/fs/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relativePath, content: sanitizedContent }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          status: "error",
          path: relativePath,
          message: `Sandbox API error: ${response.status} ${response.statusText} - ${errorBody}`,
        };
      }
      return (await response.json()) as FileWriteResult;
    } catch (error) {
      console.error(
        `[SandboxService.writeFile] Error for project ${projectId}:`,
        error
      );
      return {
        status: "error",
        path: relativePath,
        message:
          error instanceof Error
            ? error.message
            : "Network error communicating with sandbox",
      };
    }
  }

  /** Finds a running sandbox container or creates a new one. */
  private async findOrCreateSandbox(
    projectId: string,
    userId: string
  ): Promise<string> {
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
    });
    if (!project)
      throw new Error("Project not found or user does not have access.");

    if (project.sandboxContainerId) {
      try {
        const container = this.docker.getContainer(project.sandboxContainerId);
        const inspectData = await container.inspect();
        const containerIp =
          inspectData.NetworkSettings.Networks[DOCKER_NETWORK_NAME]?.IPAddress;

        if (inspectData.State.Running && containerIp) {
          // Verify it's responsive with a quick health check
          try {
            const health = await fetch(
              `http://${containerIp}:${SANDBOX_INTERNAL_PORT}/health`,
              { signal: AbortSignal.timeout(2000) }
            );
            if (health.ok) {
              // console.log(`[SandboxService] Found running & healthy sandbox for ${projectId} at ${containerIp}`);
              return `http://${containerIp}:${SANDBOX_INTERNAL_PORT}`;
            }
          } catch (healthError) {
            console.warn(
              `[SandboxService] Sandbox ${project.sandboxContainerId} found but unhealthy. Will recreate.`
            );
            // Proceed to recreate
          }
        } else if (!inspectData.State.Running) {
          console.log(
            `[SandboxService] Found stopped sandbox ${project.sandboxContainerId}. Starting...`
          );
          await container.start();
          // Re-inspect to get IP after start
          const postStartData = await container.inspect();
          const postStartIp =
            postStartData.NetworkSettings.Networks[DOCKER_NETWORK_NAME]
              ?.IPAddress;
          if (postStartIp) {
            await this.updateSandboxIp(projectId, postStartIp); // Update DB if IP changed
            await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait for server boot
            return `http://${postStartIp}:${SANDBOX_INTERNAL_PORT}`;
          } else {
            console.error(
              `[SandboxService] Started container ${project.sandboxContainerId} but failed to get IP.`
            );
            // Proceed to recreate
          }
        }
      } catch (error) {
        if (error.statusCode === 404) {
          console.warn(
            `[SandboxService] Container ${project.sandboxContainerId} DB record exists but not found in Docker. Recreating...`
          );
        } else {
          console.error(
            `[SandboxService] Error inspecting/starting container ${project.sandboxContainerId}:`,
            error
          );
        }
        // If inspection or start fails, clear DB record and proceed to create new
        await this.clearSandboxRecord(projectId);
      }
    }

    // --- Create a new container ---
    console.log(
      `[SandboxService] Creating new sandbox container for project ${projectId}...`
    );
    const volumeName = `neuralaunch_workspace_${projectId}`; // Persistent volume per project

    try {
      const container = await this.docker.createContainer({
        Image: SANDBOX_IMAGE_NAME,
        Labels: {
          "neuralaunch.projectId": projectId,
          "neuralaunch.userId": userId,
        },
        HostConfig: {
          NetworkMode: DOCKER_NETWORK_NAME,
          AutoRemove: false, // Keep container for restart
          // Mount a named volume for persistent storage
          Mounts: [
            {
              Type: "volume",
              Source: volumeName,
              Target: WORKSPACE_DIR_INSIDE_CONTAINER,
            },
          ],
        },
        Env: [
          `PROJECT_ID=${projectId}`, // Pass projectId for Pusher channel name
          `PUSHER_APP_ID=${process.env.PUSHER_APP_ID || ""}`,
          `PUSHER_KEY=${process.env.NEXT_PUBLIC_PUSHER_KEY || ""}`,
          `PUSHER_SECRET=${process.env.PUSHER_SECRET || ""}`,
          `PUSHER_CLUSTER=${process.env.NEXT_PUBLIC_PUSHER_CLUSTER || ""}`,
        ],
      });

      await container.start();
      const inspectData = await container.inspect();
      const internalIp =
        inspectData.NetworkSettings.Networks[DOCKER_NETWORK_NAME]?.IPAddress;

      if (!internalIp) {
        throw new Error(
          "Container started but could not retrieve its IP address on the network."
        );
      }

      // Save new container details to DB
      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          sandboxContainerId: container.id,
          sandboxInternalIp: internalIp,
        },
      });

      console.log(
        `[SandboxService] New sandbox ${container.id} for ${projectId} running at ${internalIp}`
      );
      await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait for internal server boot
      return `http://${internalIp}:${SANDBOX_INTERNAL_PORT}`;
    } catch (createError) {
      console.error(
        `[SandboxService] FATAL: Failed to create/start sandbox container for ${projectId}:`,
        createError
      );
      throw new Error(
        `Failed to initialize sandbox environment: ${createError.message}`
      );
    }
  }

  /** Checks if git repo exists, initializes if not. Sets basic config. */
  async gitInitIfNeeded(
    projectId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; details?: string }> {
    try {
      // Check if .git exists using a simple command that succeeds (exit 0) if it does, fails otherwise
      const checkResult = await this.execCommand(
        projectId,
        userId,
        "test -d .git",
        30
      );

      if (checkResult.exitCode === 0) {
        // console.log(`[Sandbox Git] Repository already initialized for ${projectId}`);
        return {
          success: true,
          message: "Git repository already initialized.",
        };
      }

      // Initialize and configure
      logger.info(
        `[Sandbox Git] Initializing Git repository for ${projectId}...`
      );
      const initCmd =
        'git init && git config user.email "agent@neuralaunch.ai" && git config user.name "NeuraLaunch Agent"';
      const initResult = await this.execCommand(projectId, userId, initCmd, 60);

      if (initResult.status === "error") {
        logger.error(
          `[Sandbox Git] Failed to initialize git for ${projectId}: ${initResult.stderr}`
        );
        return {
          success: false,
          message: "Failed to initialize git repository.",
          details: initResult.stderr,
        };
      }
      logger.info(
        `[Sandbox Git] Successfully initialized repository for ${projectId}.`
      );
      return {
        success: true,
        message: "Git repository initialized successfully.",
      };
    } catch (error) {
      logger.error(
        `[Sandbox Git] Error in gitInitIfNeeded for ${projectId}:`,
        error
      );
      return {
        success: false,
        message: "An unexpected error occurred during git initialization.",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Stages all changes in the sandbox workspace. */
  async gitAddAll(
    projectId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; details?: string }> {
    try {
      const addResult = await this.execCommand(
        projectId,
        userId,
        "git add .",
        60
      );
      if (addResult.status === "error") {
        logger.error(
          `[Sandbox Git] Failed to stage changes (git add) for ${projectId}: ${addResult.stderr}`
        );
        return {
          success: false,
          message: "Failed to stage changes.",
          details: addResult.stderr,
        };
      }
      // console.log(`[Sandbox Git] Staged changes for ${projectId}.`);
      return { success: true, message: "Changes staged successfully." };
    } catch (error) {
      logger.error(`[Sandbox Git] Error in gitAddAll for ${projectId}:`, error);
      return {
        success: false,
        message: "An unexpected error occurred staging changes.",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Commits staged changes with a given message. Handles "nothing to commit". */
  async gitCommit(
    projectId: string,
    userId: string,
    message: string
  ): Promise<{
    success: boolean;
    committed: boolean;
    message: string;
    details?: string;
  }> {
    try {
      // Escape potential quotes in the commit message
      const safeMessage = message.replace(/"/g, '\\"');
      const commitCmd = `git commit -m "${safeMessage}"`;
      const commitResult = await this.execCommand(
        projectId,
        userId,
        commitCmd,
        60
      );

      if (commitResult.status === "success") {
        logger.info(
          `[Sandbox Git] Committed changes for ${projectId}: "${message}"`
        );
        return {
          success: true,
          committed: true,
          message: "Changes committed successfully.",
        };
      }

      // Check specifically for "nothing to commit" which is not a failure
      if (
        commitResult.stderr?.includes("nothing to commit") ||
        commitResult.stdout?.includes("nothing to commit")
      ) {
        // console.log(`[Sandbox Git] No changes to commit for ${projectId}.`);
        return {
          success: true,
          committed: false,
          message: "No changes to commit.",
        };
      }

      // Any other error is a failure
      logger.error(
        `[Sandbox Git] Failed to commit changes for ${projectId}: ${commitResult.stderr}`
      );
      return {
        success: false,
        committed: false,
        message: "Failed to commit changes.",
        details: commitResult.stderr,
      };
    } catch (error) {
      logger.error(`[Sandbox Git] Error in gitCommit for ${projectId}:`, error);
      return {
        success: false,
        committed: false,
        message: "An unexpected error occurred during commit.",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // --- END NEW GIT HELPER METHODS ---

  // --- NEW METHOD 1: Stop Sandbox ---
  /**
   * Stops the Docker container associated with a project sandbox.
   * Does NOT remove data (volume persists).
   * @returns True if stopped successfully, false otherwise.
   */
  async stopSandbox(projectId: string, userId: string): Promise<boolean> {
    console.log(
      `[SandboxService] Attempting to stop sandbox for project ${projectId}`
    );
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { sandboxContainerId: true },
    });

    if (!project?.sandboxContainerId) {
      console.log(
        `[SandboxService] No active container found in DB for project ${projectId}. Nothing to stop.`
      );
      return true; // Consider it success if nothing to stop
    }

    try {
      const container = this.docker.getContainer(project.sandboxContainerId);
      const inspectData = await container.inspect();

      if (inspectData.State.Running) {
        console.log(
          `[SandboxService] Stopping container ${project.sandboxContainerId}...`
        );
        await container.stop({ t: 30 }); // Allow 30 seconds to stop gracefully
        console.log(
          `[SandboxService] Container ${project.sandboxContainerId} stopped.`
        );
      } else {
        console.log(
          `[SandboxService] Container ${project.sandboxContainerId} was already stopped.`
        );
      }
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        console.warn(
          `[SandboxService] Container ${project.sandboxContainerId} not found in Docker during stop. Clearing DB record.`
        );
        await this.clearSandboxRecord(projectId);
        return true; // Container gone, so effectively stopped
      } else {
        console.error(
          `[SandboxService] Error stopping container ${project.sandboxContainerId}:`,
          error
        );
        return false;
      }
    }
  }

  // --- NEW METHOD 2: Remove Sandbox ---
  /**
   * Stops and removes the Docker container AND its associated data volume.
   * USE WITH CAUTION - DATA WILL BE LOST.
   * @returns True if removed successfully, false otherwise.
   */
  async removeSandbox(projectId: string, userId: string): Promise<boolean> {
    console.warn(
      `[SandboxService] Attempting to REMOVE sandbox (container & data) for project ${projectId}`
    );
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { sandboxContainerId: true },
    });

    if (!project?.sandboxContainerId) {
      console.log(
        `[SandboxService] No active container found in DB for project ${projectId}. Nothing to remove.`
      );
      // Also check if volume exists orphanedly and remove it? Maybe later.
      return true;
    }

    const containerId = project.sandboxContainerId;
    const volumeName = `neuralaunch_workspace_${projectId}`;

    try {
      const container = this.docker.getContainer(containerId);
      console.log(
        `[SandboxService] Forcing removal of container ${containerId}...`
      );
      // Force remove stops it first if running
      await container.remove({ force: true });
      console.log(`[SandboxService] Container ${containerId} removed.`);

      // Now remove the associated volume
      try {
        const volume = this.docker.getVolume(volumeName);
        console.log(`[SandboxService] Removing volume ${volumeName}...`);
        await volume.remove();
        console.log(`[SandboxService] Volume ${volumeName} removed.`);
      } catch (volError) {
        if (volError.statusCode === 404) {
          console.log(
            `[SandboxService] Volume ${volumeName} not found, likely already removed.`
          );
        } else {
          console.error(
            `[SandboxService] Error removing volume ${volumeName}:`,
            volError
          );
          // Don't fail the whole operation just because volume removal failed
        }
      }

      // Finally, clear the DB record
      await this.clearSandboxRecord(projectId);
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        console.warn(
          `[SandboxService] Container ${containerId} not found during removal. Clearing DB record.`
        );
        await this.clearSandboxRecord(projectId);
        // Try removing volume anyway, in case it's orphaned
        try {
          await this.docker.getVolume(volumeName).remove();
          console.log(
            `[SandboxService] Removed orphaned volume ${volumeName}.`
          );
        } catch (volErr) {
          /* ignore */
        }
        return true; // Container gone, so effectively removed
      } else {
        console.error(
          `[SandboxService] Error removing container ${containerId}:`,
          error
        );
        return false;
      }
    }
  }

  /** Updates the stored IP address if it changes (e.g., container restart) */
  private async updateSandboxIp(
    projectId: string,
    newIp: string
  ): Promise<void> {
    await prisma.landingPage.update({
      where: { id: projectId },
      data: { sandboxInternalIp: newIp },
    });
  }

  /** Clears sandbox details from DB if container is lost/corrupted */
  private async clearSandboxRecord(projectId: string): Promise<void> {
    await prisma.landingPage.update({
      where: { id: projectId },
      data: { sandboxContainerId: null, sandboxInternalIp: null },
    });
  }

  // --- ✨ NEW GIT PUSH METHOD ✨ ---

  /**
   * Configures git remote and pushes the current branch to the specified GitHub repository URL.
   * Uses the provided GitHub access token for authentication.
   * Assumes 'main' branch for simplicity, can be parameterized later.
   * @param repoUrl - The HTTPS URL of the GitHub repository (e.g., https://github.com/user/repo.git)
   * @param githubToken - The user's GitHub personal access token or OAuth token.
   */
  async gitPushToRepo(
    projectId: string,
    userId: string,
    repoUrl: string,
    githubToken: string
  ): Promise<{ success: boolean; message: string; details?: string }> {
    logger.info(
      `[Sandbox Git] Attempting to push code for project ${projectId} to ${repoUrl}`
    );
    try {
      // 1. Sanitize/Validate repoUrl (basic check)
      if (!repoUrl || !repoUrl.startsWith("https://")) {
        return { success: false, message: "Invalid repository URL provided." };
      }

      // 2. Construct the authenticated URL
      // Format: https://<token>@github.com/user/repo.git
      const authenticatedUrl = repoUrl.replace(
        "https://",
        `https://${githubToken}@`
      );

      // 3. Configure the remote 'origin'
      // 'git remote remove origin' handles cases where origin might already exist (e.g., from a failed previous attempt)
      // 'git remote add origin ...' adds the authenticated URL
      const remoteCmd = `git remote remove origin 2>/dev/null || true && git remote add origin "${authenticatedUrl}"`;
      const remoteResult = await this.execCommand(
        projectId,
        userId,
        remoteCmd,
        60
      );
      if (remoteResult.status === "error") {
        logger.error(
          `[Sandbox Git] Failed to configure remote for ${projectId}: ${remoteResult.stderr}`
        );
        return {
          success: false,
          message: "Failed to configure git remote.",
          details: remoteResult.stderr,
        };
      }

      // 4. Push to the 'main' branch (force push to overwrite history if needed, common for agents)
      // We assume the agent works on the 'main' branch locally.
      // Use `--set-upstream` on first push. Force push `-f` might be needed if history diverges.
      // Let's try a simple push first, then consider force push if needed.
      const pushCmd = "git push --set-upstream origin main"; // Push 'main' branch
      const pushResult = await this.execCommand(
        projectId,
        userId,
        pushCmd,
        120
      ); // Longer timeout for push

      if (pushResult.status === "error") {
        // Check for specific common errors
        if (pushResult.stderr?.includes("Authentication failed")) {
          logger.error(
            `[Sandbox Git] Authentication failed during push for ${projectId}. Token might be invalid.`
          );
          return {
            success: false,
            message:
              "GitHub authentication failed. Token may be invalid or lack permissions.",
            details: pushResult.stderr,
          };
        }
        if (
          pushResult.stderr?.includes("src refspec main does not match any")
        ) {
          logger.warn(
            `[Sandbox Git] Push failed for ${projectId}: No 'main' branch found locally (maybe no commits yet?). Skipping push.`
          );
          // Not a critical failure if there are no commits yet.
          return {
            success: true,
            message: "Skipped push: No commits found on local 'main' branch.",
          };
        }
        if (
          pushResult.stderr?.includes("rejected") &&
          pushResult.stderr?.includes("non-fast-forward")
        ) {
          logger.warn(
            `[Sandbox Git] Push rejected for ${projectId} (non-fast-forward). Attempting force push...`
          );
          // History diverged, common if user manually pushed. Try force push.
          const forcePushCmd = "git push -f origin main";
          const forcePushResult = await this.execCommand(
            projectId,
            userId,
            forcePushCmd,
            120
          );
          if (forcePushResult.status === "error") {
            logger.error(
              `[Sandbox Git] Force push also failed for ${projectId}: ${forcePushResult.stderr}`
            );
            return {
              success: false,
              message:
                "Git push failed (non-fast-forward, force push also failed).",
              details: forcePushResult.stderr,
            };
          }
          logger.info(`[Sandbox Git] Force push successful for ${projectId}.`);
          return {
            success: true,
            message: "Code force pushed to GitHub successfully.",
          };
        }

        // Generic push failure
        logger.error(
          `[Sandbox Git] Failed to push code for ${projectId}: ${pushResult.stderr}`
        );
        return {
          success: false,
          message: "Failed to push code to GitHub.",
          details: pushResult.stderr,
        };
      }

      logger.info(
        `[Sandbox Git] Code pushed successfully for project ${projectId} to ${repoUrl}`
      );
      return { success: true, message: "Code pushed to GitHub successfully." };
    } catch (error) {
      logger.error(
        `[Sandbox Git] Error in gitPushToRepo for ${projectId}:`,
        error
      );
      return {
        success: false,
        message: "An unexpected error occurred during git push.",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Export a singleton instance
export const SandboxService = new SandboxServiceClass();
