// src/lib/services/sandbox-service.ts

import Docker from "dockerode";
import { platform } from "os";
import prisma from "@/lib/prisma";
import { sanitizeUserInput } from "@/lib/sanitize";
import { logger } from "../logger";
import { env } from "../env";

// --- CONFIGURATION ---
const IS_PRODUCTION = env.NODE_ENV === "production";
const SANDBOX_IMAGE_NAME = "neuralaunch-sandbox:latest"; // Image you pushed to Artifact Registry
const SANDBOX_INTERNAL_PORT = "8080";
const WORKSPACE_DIR_INSIDE_CONTAINER = "/workspace";

// --- LOCAL DEV CONFIG ---
const DOCKER_NETWORK_NAME = "neuralaunch-net";

// --- PRODUCTION CONFIG (from Vercel ENV) ---
// These are read from process.env, which Vercel populates
const prodDockerHost =
  process.env.DOCKER_HOST_URL?.split("://")[1].split(":")[0]; // e.g., 34.123.45.67
const prodDockerPort = env.DOCKER_HOST_URL?.split(":")[2] || 2376;
const prodDockerCACert = env.DOCKER_CA_CERT;
const prodDockerClientCert = env.DOCKER_CLIENT_CERT;
const prodDockerClientKey = env.DOCKER_CLIENT_KEY;

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
 * Connects to local Docker in development and remote GCE VM in production.
 */
class SandboxServiceClass {
  private docker: Docker;

  constructor() {
    if (IS_PRODUCTION) {
      // --- PRODUCTION CONSTRUCTOR ---
      if (
        !prodDockerHost ||
        !prodDockerCACert ||
        !prodDockerClientCert ||
        !prodDockerClientKey
      ) {
        logger.error(
          "FATAL: Production Docker environment variables (DOCKER_HOST_URL, _CA_CERT, _CLIENT_CERT, _CLIENT_KEY) are not fully set."
        );
        this.docker = new Docker(); // Non-functional
      } else {
        this.docker = new Docker({
          host: prodDockerHost,
          port: prodDockerPort,
          ca: prodDockerCACert,
          cert: prodDockerClientCert,
          key: prodDockerClientKey,
          protocol: "https",
        });
        logger.info(
          `[SandboxService] Production Mode: Configured remote Docker client for ${prodDockerHost}.`
        );
      }
    } else {
      // --- DEVELOPMENT CONSTRUCTOR (FIXED FOR WINDOWS) ---
      try {
        // Check if running on Windows
        const isWindows = platform() === "win32";

        if (isWindows) {
          logger.info(
            "[SandboxService] Windows OS detected. Connecting via default named pipe..."
          );
          // On Windows, Dockerode uses the named pipe by default if no socketPath is given.
          // Or you can be explicit: new Docker({ socketPath: '//./pipe/docker-desktop' });
          this.docker = new Docker();
        } else {
          // On Linux/macOS, use the socket path
          logger.info(
            "[SandboxService] Linux/macOS detected. Connecting via socket path..."
          );
          this.docker = new Docker({
            socketPath:
              process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
          });
        }

        logger.info("[SandboxService] Development Mode: Connected to Docker.");
        void this.ensureNetworkExists();
      } catch (error) {
        logger.error(
          "[SandboxService] FATAL: Could not connect to Docker in development.",
          error instanceof Error ? error : undefined
        );
        this.docker = new Docker(); // Non-functional
      }
    }
  }

  /** Checks if the required Docker network exists, creates if not. (Dev only) */
  private async ensureNetworkExists(): Promise<void> {
    if (IS_PRODUCTION) return;
    try {
      await this.docker.getNetwork(DOCKER_NETWORK_NAME).inspect();
      logger.info(
        `[SandboxService] Docker network "${DOCKER_NETWORK_NAME}" found.`
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        error.statusCode === 404
      ) {
        logger.warn(
          `[SandboxService] Docker network "${DOCKER_NETWORK_NAME}" not found. Creating...`
        );
        try {
          await this.docker.createNetwork({ Name: DOCKER_NETWORK_NAME });
          logger.info(
            `[SandboxService] Docker network "${DOCKER_NETWORK_NAME}" created successfully.`
          );
        } catch (createError) {
          logger.error(
            `[SandboxService] Failed to create Docker network "${DOCKER_NETWORK_NAME}":`,
            createError instanceof Error ? createError : undefined
          );
        }
      } else {
        logger.error(
          "[SandboxService] Error inspecting Docker network:",
          error instanceof Error ? error : undefined
        );
      }
    }
  }

  /**
   * Finds a running sandbox container URL or creates a new one.
   * This logic is now universal for both Dev and Prod.
   */
  private async findOrCreateSandbox(
    projectId: string,
    userId: string
  ): Promise<string> {
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { id: true, userId: true, sandboxContainerId: true }, // Select only what's needed
    });
    if (!project)
      throw new Error("Project not found or user does not have access.");

    if (project.sandboxContainerId) {
      try {
        const container = this.docker.getContainer(project.sandboxContainerId);
        const inspectData = await container.inspect();

        let containerIp: string | undefined;

        if (IS_PRODUCTION) {
          // In production, connected to GCE VM, get internal IP on default 'bridge' network
          containerIp = inspectData.NetworkSettings.IPAddress;
          if (!containerIp && inspectData.NetworkSettings.Networks) {
            containerIp =
              inspectData.NetworkSettings.Networks[
                Object.keys(inspectData.NetworkSettings.Networks)[0]
              ]?.IPAddress;
          }
        } else {
          // In development, get IP from our custom network
          containerIp =
            inspectData.NetworkSettings.Networks[DOCKER_NETWORK_NAME]
              ?.IPAddress;
        }

        if (inspectData.State.Running && containerIp) {
          const healthUrl = `http://${containerIp}:${SANDBOX_INTERNAL_PORT}/health`;
          try {
            const health = await fetch(healthUrl, {
              signal: AbortSignal.timeout(2000),
            });
            if (health.ok) {
              return `http://${containerIp}:${SANDBOX_INTERNAL_PORT}`; // Healthy and running
            }
          } catch (healthError) {
            logger.warn(
              `[SandboxService] Sandbox ${project.sandboxContainerId} found but unhealthy (failed health check at ${healthUrl}). Will recreate.`,
              {
                error:
                  healthError instanceof Error
                    ? healthError.message
                    : String(healthError),
              }
            );
          }
        } else if (!inspectData.State.Running) {
          logger.info(
            `[SandboxService] Found stopped sandbox ${project.sandboxContainerId}. Starting...`
          );
          await container.start();
          const postStartData = await container.inspect();

          let postStartIp: string | undefined;
          if (IS_PRODUCTION) {
            postStartIp = postStartData.NetworkSettings.IPAddress;
            if (!postStartIp && postStartData.NetworkSettings.Networks) {
              postStartIp =
                postStartData.NetworkSettings.Networks[
                  Object.keys(postStartData.NetworkSettings.Networks)[0]
                ]?.IPAddress;
            }
          } else {
            postStartIp =
              postStartData.NetworkSettings.Networks[DOCKER_NETWORK_NAME]
                ?.IPAddress;
          }

          if (postStartIp) {
            await this.updateSandboxIp(projectId, postStartIp);
            await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait for server boot
            return `http://${postStartIp}:${SANDBOX_INTERNAL_PORT}`;
          } else {
            logger.error(
              `[SandboxService] Started container ${project.sandboxContainerId} but failed to get IP.`
            );
          }
        }
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          error.statusCode === 404
        ) {
          logger.warn(
            `[SandboxService] Container ${project.sandboxContainerId} (DB record) not found in Docker. Recreating...`
          );
        } else {
          logger.error(
            `[SandboxService] Error inspecting/starting container ${project.sandboxContainerId}:`,
            error instanceof Error ? error : undefined
          );
        }
      }
      // If any check fails, clear the bad record and create a new container
      await this.clearSandboxRecord(projectId);
    }

    // --- Create a new container (Prod or Dev) ---
    logger.info(
      `[SandboxService] Creating new sandbox container for project ${projectId}...`
    );
    const volumeName = `neuralaunch_workspace_${projectId}`;

    // Ensure volume exists (needed for both prod/dev)
    try {
      await this.docker.getVolume(volumeName).inspect();
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        error.statusCode === 404
      ) {
        logger.info(
          `[SandboxService] Volume ${volumeName} not found. Creating...`
        );
        await this.docker.createVolume({ Name: volumeName, Driver: "local" });
      }
    }

    try {
      const containerConfig: Docker.ContainerCreateOptions = {
        Image: SANDBOX_IMAGE_NAME,
        Labels: {
          "neuralaunch.projectId": projectId,
          "neuralaunch.userId": userId,
        },
        HostConfig: {
          AutoRemove: false, // Keep container for restart
          Mounts: [
            {
              Type: "volume",
              Source: volumeName,
              Target: WORKSPACE_DIR_INSIDE_CONTAINER,
            },
          ],
        },
        Env: [
          `PROJECT_ID=${projectId}`, // For Pusher channel (used by sandbox-server.js)
          `PUSHER_APP_ID=${env.PUSHER_APP_ID || ""}`,
          `PUSHER_KEY=${env.NEXT_PUBLIC_PUSHER_KEY || ""}`,
          `PUSHER_SECRET=${env.PUSHER_SECRET || ""}`,
          `PUSHER_CLUSTER=${env.NEXT_PUBLIC_PUSHER_CLUSTER || ""}`,
        ],
      };

      // Add network config *only* for development
      if (!IS_PRODUCTION) {
        containerConfig.HostConfig!.NetworkMode = DOCKER_NETWORK_NAME;
      }

      const container = await this.docker.createContainer(containerConfig);

      await container.start();
      const inspectData = await container.inspect();

      let internalIp: string | undefined;
      if (IS_PRODUCTION) {
        internalIp = inspectData.NetworkSettings.IPAddress;
        if (!internalIp && inspectData.NetworkSettings.Networks) {
          internalIp =
            inspectData.NetworkSettings.Networks[
              Object.keys(inspectData.NetworkSettings.Networks)[0]
            ]?.IPAddress;
        }
      } else {
        internalIp =
          inspectData.NetworkSettings.Networks[DOCKER_NETWORK_NAME]?.IPAddress;
      }

      if (!internalIp) {
        throw new Error(
          "Container started but could not retrieve its IP address."
        );
      }

      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          sandboxContainerId: container.id,
          sandboxInternalIp: internalIp,
          sandboxLastAccessedAt: new Date(), // Set last accessed time on creation
        },
      });

      logger.info(
        `[SandboxService] New sandbox ${container.id} for ${projectId} running at ${internalIp}`
      );
      await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait for internal server boot
      return `http://${internalIp}:${SANDBOX_INTERNAL_PORT}`;
    } catch (createError) {
      logger.error(
        `[SandboxService] FATAL: Failed to create/start sandbox container for ${projectId}:`,
        createError instanceof Error ? createError : undefined
      );
      throw new Error(
        `Failed to initialize sandbox environment: ${createError instanceof Error ? createError.message : String(createError)}`
      );
    }
  }

  /** Executes a command inside the project's specific sandbox. */
  async execCommand(
    projectId: string,
    userId: string,
    command: string,
    timeout: number // Timeout in seconds
  ): Promise<ExecResult> {
    try {
      const sandboxUrl = await this.findOrCreateSandbox(projectId, userId);
      if (!sandboxUrl) {
        throw new Error("Could not find or create sandbox environment.");
      }

      // Update last accessed time
      void prisma.landingPage.update({
        where: { id: projectId },
        data: { sandboxLastAccessedAt: new Date() },
      });

      const fetchTimeoutMs = (timeout + 10) * 1000;

      const response = await fetch(`${sandboxUrl}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, timeout }),
        signal: AbortSignal.timeout(fetchTimeoutMs),
      });

      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => `HTTP Status ${response.status}`);
        return {
          status: "error",
          exitCode: -1,
          stdout: "",
          stderr: `Sandbox API error: ${response.status} ${response.statusText}. Response: ${errorText}`,
        };
      }
      return (await response.json()) as ExecResult;
    } catch (error) {
      logger.error(
        `[SandboxService.execCommand] Error for project ${projectId}:`,
        error instanceof Error ? error : undefined
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
    relativePath: string,
    content: string
  ): Promise<FileWriteResult> {
    try {
      if (relativePath.includes("..") || relativePath.startsWith("/")) {
        return {
          status: "error",
          path: relativePath,
          message: "Invalid path: Must be relative and cannot contain '..'.",
        };
      }

      const sandboxUrl = await this.findOrCreateSandbox(projectId, userId);
      if (!sandboxUrl) {
        throw new Error("Could not find or create sandbox environment.");
      }

      // Update last accessed time
      void prisma.landingPage.update({
        where: { id: projectId },
        data: { sandboxLastAccessedAt: new Date() },
      });

      const sanitizedContent = sanitizeUserInput(content);

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
      logger.error(
        `[SandboxService.writeFile] Error for project ${projectId}:`,
        error instanceof Error ? error : undefined
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

  /** Checks if git repo exists, initializes if not. Sets basic config. */
  async gitInitIfNeeded(
    projectId: string,
    userId: string
  ): Promise<{ success: boolean; message: string; details?: string }> {
    try {
      const checkResult = await this.execCommand(
        projectId,
        userId,
        "test -d .git",
        30
      );
      if (checkResult.exitCode === 0) {
        return {
          success: true,
          message: "Git repository already initialized.",
        };
      }
      logger.info(
        `[Sandbox Git] Initializing Git repository for ${projectId}...`
      );
      const initCmd =
        'git init -b main && git config user.email "agent@neuralaunch.ai" && git config user.name "NeuraLaunch Agent"'; // Init with 'main' branch
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
        error instanceof Error ? error : undefined
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
      return { success: true, message: "Changes staged successfully." };
    } catch (error) {
      logger.error(
        `[Sandbox Git] Error in gitAddAll for ${projectId}:`,
        error instanceof Error ? error : undefined
      );
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
      const safeMessage = message.replace(/"/g, '\\"');
      // --allow-empty-message in case summary is empty
      const commitCmd = `git commit --allow-empty-message -m "${safeMessage}"`;
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
      if (
        commitResult.stderr?.includes("nothing to commit") ||
        commitResult.stdout?.includes("nothing to commit")
      ) {
        return {
          success: true,
          committed: false,
          message: "No changes to commit.",
        };
      }
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
      logger.error(
        `[Sandbox Git] Error in gitCommit for ${projectId}:`,
        error instanceof Error ? error : undefined
      );
      return {
        success: false,
        committed: false,
        message: "An unexpected error occurred during commit.",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * *** CLEANED UP ***
   * Creates a new branch in the sandbox, checking out from 'origin/main'.
   * Ensures it fetches the latest state from remote.
   */
  async gitCreateBranch(
    projectId: string,
    userId: string,
    branchName: string
  ): Promise<{ success: boolean; message: string; details?: string }> {
    logger.info(
      `[Sandbox Git] Creating/switching to branch '${branchName}' for ${projectId}`
    );
    try {
      // 1. Fetch latest from origin. This relies on the remote being configured.
      const fetchCmd = "git fetch origin";
      const fetchResult = await this.execCommand(
        projectId,
        userId,
        fetchCmd,
        60
      );
      if (fetchResult.status === "error") {
        // This will fail if the remote isn't configured yet (first run). This is OK.
        if (
          !fetchResult.stderr.includes(
            "fatal: 'origin' does not appear to be a git repository"
          )
        ) {
          logger.warn(
            `[Sandbox Git] 'git fetch origin' failed (but proceeding): ${fetchResult.stderr}`
          );
        }
      }

      // 2. Try to create branch from origin/main
      const branchCmd = `git checkout -b "${branchName}" origin/main`;
      const branchResult = await this.execCommand(
        projectId,
        userId,
        branchCmd,
        60
      );

      if (branchResult.status === "error") {
        if (branchResult.stderr?.includes("already exists")) {
          logger.warn(
            `[Sandbox Git] Branch '${branchName}' already exists. Checking it out and resetting to origin/main...`
          );
          // Branch exists, check it out and reset it to match remote 'main'
          // This assumes 'git fetch' worked. If not, 'origin/main' will fail.
          const checkoutCmd = `git checkout "${branchName}" && git reset --hard "origin/main"`;
          const checkoutResult = await this.execCommand(
            projectId,
            userId,
            checkoutCmd,
            60
          );
          if (checkoutResult.status === "error") {
            // Fallback if 'origin/main' doesn't exist (e.g., first run)
            if (
              checkoutResult.stderr?.includes("origin/main' is not a commit")
            ) {
              logger.warn(
                "[Sandbox Git] 'origin/main' not found. Just checking out branch."
              );
              const justCheckoutCmd = `git checkout "${branchName}"`;
              const justCheckoutResult = await this.execCommand(
                projectId,
                userId,
                justCheckoutCmd,
                60
              );
              if (justCheckoutResult.status === "error") {
                throw new Error(
                  `Failed to checkout existing branch: ${justCheckoutResult.stderr}`
                );
              }
              return {
                success: true,
                message: `Branch already exists, checked out.`,
              };
            }
            throw new Error(
              `Failed to checkout/reset existing branch: ${checkoutResult.stderr}`
            );
          }
          return {
            success: true,
            message: `Branch already exists, checked out and reset.`,
          };
        }
        // If fetch failed, origin/main might not exist. Try creating branch from local main.
        if (branchResult.stderr?.includes("origin/main' is not a commit")) {
          logger.warn(
            "[Sandbox Git] 'origin/main' not found. Creating branch from local 'main'."
          );
          const localBranchCmd = `git checkout -b "${branchName}" main`;
          const localBranchResult = await this.execCommand(
            projectId,
            userId,
            localBranchCmd,
            60
          );
          if (localBranchResult.status === "error") {
            if (localBranchResult.stderr?.includes("already exists")) {
              logger.warn(
                `[Sandbox Git] Branch '${branchName}' already exists. Checking it out...`
              );
              const checkoutCmd = `git checkout "${branchName}"`; // Just checkout
              await this.execCommand(projectId, userId, checkoutCmd, 60);
              return {
                success: true,
                message: `Branch already exists, checked out.`,
              };
            }
            throw new Error(
              `Failed to create local branch: ${localBranchResult.stderr}`
            );
          }
          return {
            success: true,
            message: `Branch ${branchName} created from local main.`,
          };
        }
        // Other error
        throw new Error(branchResult.stderr);
      }
      return {
        success: true,
        message: `Branch ${branchName} created and checked out from origin/main.`,
      };
    } catch (error) {
      logger.error(
        `[Sandbox Git] Error creating branch ${branchName}:`,
        error instanceof Error ? error : undefined
      );
      return {
        success: false,
        message: "Failed to create branch.",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Configures git remote and pushes the specified branch to origin. */
  async gitPushToBranch(
    projectId: string,
    userId: string,
    repoUrl: string,
    githubToken: string,
    branchName: string
  ): Promise<{ success: boolean; message: string; details?: string }> {
    logger.info(
      `[Sandbox Git] Attempting to push branch '${branchName}' for ${projectId}`
    );
    try {
      if (!repoUrl || !repoUrl.startsWith("https://")) {
        return { success: false, message: "Invalid repository URL provided." };
      }
      const authenticatedUrl = repoUrl.replace(
        "https://",
        `https://${githubToken}@`
      );

      // 1. Configure the remote 'origin'
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

      // 2. Push the specified branch
      // -u sets upstream, -f forces push (necessary if agent re-runs a step on an existing branch)
      const pushCmd = `git push -u -f origin "${branchName}"`;
      const pushResult = await this.execCommand(
        projectId,
        userId,
        pushCmd,
        120
      );

      if (pushResult.status === "error") {
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
          pushResult.stderr?.includes("src refspec") &&
          pushResult.stderr?.includes("does not match any")
        ) {
          logger.warn(
            `[Sandbox Git] Push failed for ${projectId}: Branch '${branchName}' not found locally (maybe no commits?). Skipping push.`
          );
          return {
            success: true,
            message: `Skipped push: No commits found on local branch '${branchName}'.`,
          };
        }
        // Other errors
        logger.error(
          `[Sandbox Git] Failed to push branch ${branchName}: ${pushResult.stderr}`
        );
        return {
          success: false,
          message: "Failed to push code to GitHub.",
          details: pushResult.stderr,
        };
      }

      logger.info(
        `[Sandbox Git] Branch ${branchName} pushed successfully to ${repoUrl}`
      );
      return {
        success: true,
        message: `Branch ${branchName} pushed successfully.`,
      };
    } catch (error) {
      logger.error(
        `[Sandbox Git] Error in gitPushToBranch for ${projectId}:`,
        error instanceof Error ? error : undefined
      );
      return {
        success: false,
        message: "An unexpected error occurred during git push.",
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // --- Cleanup Functions ---

  /** Stops the Docker container associated with a project sandbox. */
  async stopSandbox(projectId: string, userId: string): Promise<boolean> {
    logger.info(
      `[SandboxService] Attempting to stop sandbox for project ${projectId}`
    );
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { sandboxContainerId: true },
    });
    if (!project?.sandboxContainerId) {
      logger.warn(
        `[SandboxService] No active container found in DB for project ${projectId}. Nothing to stop.`
      );
      return true;
    }
    try {
      const container = this.docker.getContainer(project.sandboxContainerId);
      const inspectData = await container.inspect();
      if (inspectData.State.Running) {
        logger.info(
          `[SandboxService] Stopping container ${project.sandboxContainerId}...`
        );
        await container.stop({ t: 30 }); // 30 sec grace period
        logger.info(
          `[SandboxService] Container ${project.sandboxContainerId} stopped.`
        );
      } else {
        logger.info(
          `[SandboxService] Container ${project.sandboxContainerId} was already stopped.`
        );
      }
      return true;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        error.statusCode === 404
      ) {
        logger.warn(
          `[SandboxService] Container ${project.sandboxContainerId} not found in Docker during stop. Clearing DB record.`
        );
        await this.clearSandboxRecord(projectId);
        return true; // Effectively stopped
      } else {
        logger.error(
          `[SandboxService] Error stopping container ${project.sandboxContainerId}:`,
          error instanceof Error ? error : undefined
        );
        return false;
      }
    }
  }

  /** Stops and removes the Docker container AND its associated data volume. */
  async removeSandbox(projectId: string, userId: string): Promise<boolean> {
    logger.warn(
      `[SandboxService] Attempting to REMOVE sandbox (container & data) for project ${projectId}`
    );
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { sandboxContainerId: true },
    });

    const containerId = project?.sandboxContainerId;
    const volumeName = `neuralaunch_workspace_${projectId}`; // Standard volume name

    // Always try to remove the volume, even if container ID is missing (orphaned volume)
    try {
      const volume = this.docker.getVolume(volumeName);
      await volume.inspect(); // Check if it exists
      logger.info(`[SandboxService] Removing volume ${volumeName}...`);
      await volume.remove();
      logger.info(`[SandboxService] Volume ${volumeName} removed.`);
    } catch (volError) {
      if (
        volError &&
        typeof volError === "object" &&
        "statusCode" in volError &&
        volError.statusCode === 404
      ) {
        logger.info(
          `[SandboxService] Volume ${volumeName} not found, likely already removed.`
        );
      } else {
        logger.error(
          `[SandboxService] Error removing volume ${volumeName} (might be in use or not found):`,
          volError instanceof Error ? volError : undefined
        );
      }
    }

    // Now, try to remove the container if its ID is known
    if (!containerId) {
      logger.warn(
        `[SandboxService] No container ID found in DB for project ${projectId}. Volume cleanup (if any) is complete.`
      );
      return true;
    }

    try {
      const container = this.docker.getContainer(containerId);
      logger.info(
        `[SandboxService] Forcing removal of container ${containerId}...`
      );
      await container.remove({ force: true }); // force=true stops it if running
      logger.info(`[SandboxService] Container ${containerId} removed.`);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        error.statusCode === 404
      ) {
        logger.warn(
          `[SandboxService] Container ${containerId} not found during removal.`
        );
      } else {
        logger.error(
          `[SandboxService] Error removing container ${containerId}:`,
          error instanceof Error ? error : undefined
        );
        // Don't return false yet, still try to clear DB record
      }
    }

    // Finally, clear the DB record
    await this.clearSandboxRecord(projectId);
    return true; // Return true as the cleanup operation is complete
  }

  /** Updates the stored IP address if it changes. */
  private async updateSandboxIp(
    projectId: string,
    newIp: string
  ): Promise<void> {
    await prisma.landingPage.update({
      where: { id: projectId },
      data: { sandboxInternalIp: newIp },
    });
  }

  /** Clears sandbox details from DB. */
  private async clearSandboxRecord(projectId: string): Promise<void> {
    await prisma.landingPage.update({
      where: { id: projectId },
      data: { sandboxContainerId: null, sandboxInternalIp: null },
    });
  }
}

// Export a singleton instance
export const SandboxService = new SandboxServiceClass();
