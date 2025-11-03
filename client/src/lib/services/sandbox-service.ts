// src/lib/services/sandbox-service.ts

import Docker from "dockerode";
import { platform } from "os";
import prisma from "@/lib/prisma";
import { sanitizeUserInput } from "@/lib/sanitize";
import { logger } from "../logger";
import { env } from "../env"; // Use validated env
import fs from "fs"; // <-- NEW
import { execSync } from "child_process";

// --- CONFIGURATION ---
const IS_PRODUCTION = env.NODE_ENV === "production";
const SANDBOX_IMAGE_NAME =
  "us-central1-docker.pkg.dev/gen-lang-client-0239783733/neuralaunch-images/neuralaunch-sandbox:v2";
const SANDBOX_INTERNAL_PORT = "8080";
const WORKSPACE_DIR_INSIDE_CONTAINER = "/workspace";

// --- LOCAL DEV CONFIG ---
const DOCKER_NETWORK_NAME = "neuralaunch-net";

// --- PRODUCTION CONFIG (from Vercel ENV) ---
const prodDockerHost = env.DOCKER_HOST_URL.split("://")[1].split(":")[0];
const prodDockerPort = env.DOCKER_HOST_URL.split(":")[2] || 2376;
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
          "FATAL: Production Docker environment variables are not fully set."
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
      // --- DEVELOPMENT CONSTRUCTOR ---
      try {
        const isWindows = platform() === "win32";
        if (isWindows) {
          logger.info(
            "[SandboxService] Windows OS detected. Connecting via default Docker pipe..."
          );
          this.docker = new Docker();
        } else {
          const socketPath = env.DOCKER_SOCKET_PATH || "/var/run/docker.sock";
          logger.info(
            `[SandboxService] Linux/macOS detected. Connecting via socket path: ${socketPath}`
          );
          this.docker = new Docker({ socketPath: socketPath });
        }
        logger.info(
          "[SandboxService] Development Mode: Docker client initialized."
        );
        void this.ensureNetworkExists();
      } catch (error) {
        logger.error(
          "[SandboxService] FATAL: Could not connect to local Docker Desktop. Is it running?",
          error instanceof Error ? error : undefined
        );
        throw new Error("SandboxService failed to connect to Docker.");
      }
    }
  }

  /** Checks if the required Docker network exists, creates if not. (Dev only) */
  private async ensureNetworkExists(): Promise<void> {
    if (IS_PRODUCTION) return;
    try {
      await this.docker.ping();
      logger.info("[SandboxService] Docker ping successful.");
    } catch (pingError) {
      logger.error(
        "[SandboxService] Docker ping failed. Is Docker Desktop running?",
        pingError instanceof Error ? pingError : undefined
      );
      return;
    }

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
        } catch (createError: unknown) {
          const error = createError instanceof Error ? createError : undefined;
          logger.error(
            `[SandboxService] Failed to create Docker network "${DOCKER_NETWORK_NAME}":`,
            error
          );
          throw new Error(
            `Failed to create docker network: ${createError instanceof Error ? createError.message : String(createError)}`
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
   * Finds a running sandbox URL or creates a new one.
   * Returns the PUBLICLY ACCESSIBLE URL for the sandbox.
   */
  private async findOrCreateSandbox(
    projectId: string,
    userId: string
  ): Promise<string> {
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: {
        id: true,
        userId: true,
        sandboxContainerId: true,
        sandboxHostPort: true,
      },
    });
    if (!project)
      throw new Error("Project not found or user does not have access.");

    // The public IP of the host VM (in prod) or localhost (in dev)
    const hostIp = IS_PRODUCTION ? prodDockerHost : "localhost";

    if (project.sandboxContainerId) {
      try {
        const container = this.docker.getContainer(project.sandboxContainerId);
        const inspectData = await container.inspect();

        let containerUrl: string | null = null;
        const hostPort = project.sandboxHostPort; // Get stored public port

        if (IS_PRODUCTION) {
          // --- PRODUCTION: Check existing container ---
          if (inspectData.State.Running && hostPort && hostIp) {
            containerUrl = `http://${hostIp}:${hostPort}`;
          }
        } else {
          // --- DEVELOPMENT: Check existing container ---
          const devHostPort =
            inspectData.HostConfig.PortBindings?.[
              `${SANDBOX_INTERNAL_PORT}/tcp`
            ]?.[0]?.HostPort;
          if (inspectData.State.Running && devHostPort) {
            containerUrl = `http://localhost:${devHostPort}`;
          } else if (inspectData.State.Running && !devHostPort) {
            // Fallback for dev (e.g., Linux Docker)
            const containerIp =
              inspectData.NetworkSettings.Networks[DOCKER_NETWORK_NAME]
                ?.IPAddress;
            if (containerIp) {
              containerUrl = `http://${containerIp}:${SANDBOX_INTERNAL_PORT}`;
            }
          }
        }

        if (containerUrl) {
          try {
            const health = await fetch(`${containerUrl}/health`, {
              signal: AbortSignal.timeout(3000),
            }); // 3s timeout
            if (health.ok) {
              logger.info(
                `[SandboxService] Found healthy sandbox for ${projectId} at ${containerUrl}`
              );
              return containerUrl;
            }
          } catch {
            logger.warn(
              `[SandboxService] Sandbox ${project.sandboxContainerId} found but unhealthy (failed health check at ${containerUrl}). Will recreate.`
            );
          }
        }

        logger.warn(
          `[SandboxService] Sandbox ${project.sandboxContainerId} is in a bad state. Removing and recreating...`
        );
        await this.removeSandbox(projectId, userId);
      } catch (error: unknown) {
        if (
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          (error as { statusCode: number }).statusCode === 404
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
        await this.clearSandboxRecord(projectId);
      }
    }

    // --- Create a new container (Prod or Dev) ---
    logger.info(
      `[SandboxService] Creating new sandbox container for project ${projectId}...`
    );
    const volumeName = `neuralaunch_workspace_${projectId}`;

    try {
      await this.docker.getVolume(volumeName).inspect();
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        (error as { statusCode: number }).statusCode === 404
      ) {
        logger.info(
          `[SandboxService] Volume ${volumeName} not found. Creating...`
        );
        await this.docker.createVolume({ Name: volumeName, Driver: "local" });
      }
    }

    try {
      // --- START: DOCKERODE INTERNAL AUTHENTICATION FIX ---
      let authConfig: { auth: string; serveraddress?: string } | undefined =
        undefined;
      const registryHost = "us-central1-docker.pkg.dev";

      if (IS_PRODUCTION) {
        logger.info(
          "[SandboxService] Configuring Dockerode internal authentication..."
        );

        const keyJson = env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

        if (!keyJson) {
          throw new Error(
            "GOOGLE_APPLICATION_CREDENTIALS_JSON is missing from Vercel ENV."
          );
        }

        try {
          // 1. Authenticate using the _json_key method for Google Artifact Registry (GCR)
          const username = "_json_key";
          const password = keyJson;

          // Use Buffer.from for Base64 encoding the credentials
          // Buffer is globally available in Node.js/Vercel
          const authString = Buffer.from(`${username}:${password}`).toString(
            "base64"
          );

          authConfig = {
            auth: authString,
            serveraddress: `https://${registryHost}`, // Required by Docker API
          };
          logger.info(
            `[SandboxService] Dockerode credentials configured for ${registryHost}.`
          );
        } catch (authError) {
          logger.error(
            "[SandboxService] FATAL: Failed to configure Dockerode auth.",
            authError instanceof Error ? authError : undefined
          );
          throw new Error(
            `Failed to configure Dockerode authentication: ${authError instanceof Error ? authError.message : String(authError)}`
          );
        }
      }
      // --- END: DOCKERODE INTERNAL AUTHENTICATION FIX ---

      // The pull operation now receives the credentials directly in the options object.
      try {
        logger.info(`[SandboxService] Pulling image: ${SANDBOX_IMAGE_NAME}`);

        // The options argument for docker.pull is used to pass auth credentials
        const pullOptions = authConfig ? { authconfig: authConfig } : {};

        await new Promise<void>((resolve, reject) => {
          // Pass pullOptions directly to docker.pull
          this.docker.pull(SANDBOX_IMAGE_NAME, pullOptions, (err, stream) => {
            if (err)
              return reject(
                err instanceof Error ? err : new Error(String(err))
              );
            if (!stream)
              return reject(new Error("No stream returned from docker.pull"));

            // We must wait for the stream to end to know the pull is complete
            this.docker.modem.followProgress(stream, (err, res) => {
              if (err)
                return reject(
                  err instanceof Error ? err : new Error(String(err))
                );
              resolve();
            });
          });
        });
        logger.info(`[SandboxService] Successfully pulled latest image.`);
      } catch (pullError: unknown) {
        logger.error(
          `[SandboxService] FATAL: Failed to pull sandbox image:`,
          pullError instanceof Error ? pullError : undefined
        );
        throw new Error(
          `Failed to pull sandbox image: ${pullError instanceof Error ? pullError.message : String(pullError)}`
        );
      }

      const containerConfig: Docker.ContainerCreateOptions = {
        Image: SANDBOX_IMAGE_NAME,
        Labels: {
          "neuralaunch.projectId": projectId,
          "neuralaunch.userId": userId,
        },
        ExposedPorts: { [`${SANDBOX_INTERNAL_PORT}/tcp`]: {} }, // Expose the internal port
        HostConfig: {
          AutoRemove: false,
          Mounts: [
            {
              Type: "volume",
              Source: volumeName,
              Target: WORKSPACE_DIR_INSIDE_CONTAINER,
            },
          ],
          PortBindings: {
            // *** THIS IS THE KEY PRODUCTION FIX ***
            // Bind internal 8080 to a RANDOM, available public port on the host VM
            [`${SANDBOX_INTERNAL_PORT}/tcp`]: [{ HostPort: "" }], // "" = assign a random port
          },
        },
        Env: [
          `PROJECT_ID=${projectId}`,
          `PUSHER_APP_ID=${env.PUSHER_APP_ID}`,
          `PUSHER_KEY=${env.NEXT_PUBLIC_PUSHER_KEY}`,
          `PUSHER_SECRET=${env.PUSHER_SECRET}`,
          `PUSHER_CLUSTER=${env.NEXT_PUBLIC_PUSHER_CLUSTER}`,
        ],
      };

      if (!IS_PRODUCTION) {
        containerConfig.HostConfig!.NetworkMode = DOCKER_NETWORK_NAME;
      }

      const container = await this.docker.createContainer(containerConfig);
      await container.start();
      const inspectData = await container.inspect();

      // --- Get the Publicly Accessible URL ---
      const hostPort =
        inspectData.NetworkSettings.Ports[`${SANDBOX_INTERNAL_PORT}/tcp`]?.[0]
          ?.HostPort;
      const internalIp = IS_PRODUCTION
        ? inspectData.NetworkSettings.IPAddress ||
          Object.values(inspectData.NetworkSettings.Networks)[0]?.IPAddress
        : inspectData.NetworkSettings.Networks[DOCKER_NETWORK_NAME]?.IPAddress;

      if (!hostPort || !hostIp) {
        throw new Error(
          "Container started but failed to get HostPort mapping or Host IP."
        );
      }

      // We always use the HOST IP (public VM IP or localhost) + the MAPPED port
      const publicUrl = `http://${hostIp}:${hostPort}`;

      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          sandboxContainerId: container.id,
          sandboxInternalIp: internalIp,
          sandboxHostPort: hostPort, // Save the new public port
          sandboxLastAccessedAt: new Date(),
        },
      });

      logger.info(
        `[SandboxService] New sandbox ${container.id} for ${projectId} running at ${publicUrl}`
      );
      await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait for server boot

      return publicUrl; // Return the *publicly accessible* URL
    } catch (createError: unknown) {
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
        'git init -b main && git config user.email "agent@neuralaunch.ai" && git config user.name "NeuraLaunch Agent"';
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

  /** Creates a new branch in the sandbox, checking out from 'origin/main'. */
  async gitCreateBranch(
    projectId: string,
    userId: string,
    branchName: string
  ): Promise<{ success: boolean; message: string; details?: string }> {
    logger.info(
      `[Sandbox Git] Creating/switching to branch '${branchName}' for ${projectId}`
    );
    try {
      // 1. Fetch latest from origin.
      const fetchCmd = "git fetch origin";
      const fetchResult = await this.execCommand(
        projectId,
        userId,
        fetchCmd,
        60
      );
      if (fetchResult.status === "error") {
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
          const checkoutCmd = `git checkout "${branchName}" && git reset --hard "origin/main"`;
          const checkoutResult = await this.execCommand(
            projectId,
            userId,
            checkoutCmd,
            60
          );
          if (checkoutResult.status === "error") {
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
              const checkoutCmd = `git checkout "${branchName}"`;
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

      const pushCmd = `git push -u -f origin "${branchName}"`;
      const pushResult = await this.execCommand(
        projectId,
        userId,
        pushCmd,
        120
      );

      if (pushResult.status === "error") {
        if (pushResult.stderr?.includes("Authentication failed")) {
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
          return {
            success: true,
            message: `Skipped push: No commits found on local branch '${branchName}'.`,
          };
        }
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
        `[SandboxService] No active container found in DB for project ${projectId}.`
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
        await container.stop({ t: 30 });
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
          `[SandboxService] Container ${project.sandboxContainerId} not found in Docker. Clearing DB record.`
        );
        await this.clearSandboxRecord(projectId);
        return true;
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
    const volumeName = `neuralaunch_workspace_${projectId}`;

    try {
      const volume = this.docker.getVolume(volumeName);
      await volume.inspect();
      logger.info(`[SandboxService] Removing volume ${volumeName}...`);
      await volume.remove();
      logger.info(`[SandboxService] Volume ${volumeName} removed.`);
    } catch (volError: unknown) {
      if (
        volError &&
        typeof volError === "object" &&
        "statusCode" in volError &&
        volError.statusCode === 404
      ) {
        logger.info(`[SandboxService] Volume ${volumeName} not found.`);
      } else {
        logger.error(
          `[SandboxService] Error removing volume ${volumeName}:`,
          volError instanceof Error ? volError : undefined
        );
      }
    }

    if (containerId) {
      try {
        const container = this.docker.getContainer(containerId);
        logger.info(
          `[SandboxService] Forcing removal of container ${containerId}...`
        );
        await container.remove({ force: true });
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
        }
      }
    } else {
      logger.warn(
        `[SandboxService] No container ID found in DB for project ${projectId}.`
      );
    }

    await this.clearSandboxRecord(projectId);
    return true;
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
      data: {
        sandboxContainerId: null,
        sandboxInternalIp: null,
        sandboxHostPort: null, // <-- Also clear the host port
      },
    });
  }
}

// Export a singleton instance
export const SandboxService = new SandboxServiceClass();
