// src/lib/services/sandbox-service.ts

/**
 * Sandbox Service
 * 
 * Manages Docker containers for isolated code execution environments.
 * Each project gets its own sandboxed container for secure code execution.
 */

import Docker from "dockerode";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

const docker = new Docker();

// Type definitions for sandbox operations
interface SandboxResult {
  status: "success" | "error";
  message: string;
  details?: string;
}

interface ExecResult extends SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface WriteFileResult extends SandboxResult {
  path?: string;
  size?: number;
}

interface GitOperationResult {
  success: boolean;
  details?: string;
  message?: string;
}

// Configuration constants
const SANDBOX_IMAGE = "ideaspark-sandbox:latest";
const SANDBOX_NETWORK = "ideaspark-network";
const WORKSPACE_DIR = "/workspace";

/**
 * SandboxService provides methods to manage and interact with project sandboxes
 */
export class SandboxService {
  /**
   * Ensures a sandbox container exists for a project. Creates if needed.
   */
  static async ensureSandbox(
    projectId: string,
    userId: string
  ): Promise<{ containerId: string; internalIp: string }> {
    logger.debug(\`[SandboxService] Ensuring sandbox for project \${projectId}\`);

    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId },
      select: { sandboxContainerId: true, sandboxInternalIp: true },
    });

    if (!project) {
      throw new Error(\`Project \${projectId} not found or access denied\`);
    }

    // If sandbox exists and is running, return its info
    if (project.sandboxContainerId && project.sandboxInternalIp) {
      try {
        const container = docker.getContainer(project.sandboxContainerId);
        const info = await container.inspect();
        if (info.State.Running) {
          logger.debug(
            \`[SandboxService] Sandbox already running for project \${projectId}\`
          );
          return {
            containerId: project.sandboxContainerId,
            internalIp: project.sandboxInternalIp,
          };
        }
      } catch (error) {
        logger.warn(
          \`[SandboxService] Container \${project.sandboxContainerId} not found, will create new\`,
          error instanceof Error ? error : undefined
        );
      }
    }

    // Create new sandbox
    logger.info(\`[SandboxService] Creating new sandbox for project \${projectId}\`);
    const container = await docker.createContainer({
      Image: SANDBOX_IMAGE,
      name: \`sandbox-\${projectId}\`,
      Env: [
        \`PROJECT_ID=\${projectId}\`,
        \`PUSHER_APP_ID=\${process.env.PUSHER_APP_ID || ""}\`,
        \`PUSHER_KEY=\${process.env.PUSHER_KEY || ""}\`,
        \`PUSHER_SECRET=\${process.env.PUSHER_SECRET || ""}\`,
        \`PUSHER_CLUSTER=\${process.env.PUSHER_CLUSTER || ""}\`,
      ],
      HostConfig: {
        NetworkMode: SANDBOX_NETWORK,
        Memory: 512 * 1024 * 1024, // 512MB limit
        NanoCpus: 1000000000, // 1 CPU core
      },
      WorkingDir: WORKSPACE_DIR,
    });

    await container.start();
    const info = await container.inspect();
    const internalIp =
      info.NetworkSettings.Networks[SANDBOX_NETWORK]?.IPAddress || "";

    if (!internalIp) {
      throw new Error("Failed to get container IP address");
    }

    // Update database
    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        sandboxContainerId: container.id,
        sandboxInternalIp: internalIp,
        sandboxLastAccessedAt: new Date(),
      },
    });

    logger.info(
      \`[SandboxService] Sandbox created for project \${projectId}: \${container.id}\`
    );
    return { containerId: container.id, internalIp };
  }

  /**
   * Stops and removes a sandbox container
   */
  static async stopSandbox(projectId: string, userId: string): Promise<boolean> {
    logger.info(\`[SandboxService] Stopping sandbox for project \${projectId}\`);

    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId },
      select: { sandboxContainerId: true },
    });

    if (!project?.sandboxContainerId) {
      logger.debug(\`[SandboxService] No sandbox to stop for project \${projectId}\`);
      return true;
    }

    try {
      const container = docker.getContainer(project.sandboxContainerId);
      await container.stop({ t: 10 });
      await container.remove();

      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          sandboxContainerId: null,
          sandboxInternalIp: null,
        },
      });

      logger.info(
        \`[SandboxService] Sandbox stopped for project \${projectId}\`
      );
      return true;
    } catch (error) {
      logger.error(
        \`[SandboxService] Error stopping sandbox for project \${projectId}\`,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Executes a command in the sandbox
   */
  static async execCommand(
    projectId: string,
    userId: string,
    command: string,
    timeout: number = 300
  ): Promise<ExecResult> {
    const { internalIp } = await this.ensureSandbox(projectId, userId);

    try {
      const response = await fetch(\`http://\${internalIp}:8080/exec\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, timeout }),
      });

      const result = (await response.json()) as ExecResult;

      await prisma.landingPage.update({
        where: { id: projectId },
        data: { sandboxLastAccessedAt: new Date() },
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        \`[SandboxService] Command execution failed for project \${projectId}\`,
        error instanceof Error ? error : undefined
      );
      return {
        status: "error",
        exitCode: -1,
        stdout: "",
        stderr: errorMessage,
        message: "Failed to execute command",
      };
    }
  }

  /**
   * Writes a file to the sandbox filesystem
   */
  static async writeFile(
    projectId: string,
    userId: string,
    filePath: string,
    content: string
  ): Promise<WriteFileResult> {
    const { internalIp } = await this.ensureSandbox(projectId, userId);

    try {
      const response = await fetch(\`http://\${internalIp}:8080/fs/write\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content }),
      });

      const result = (await response.json()) as WriteFileResult;

      await prisma.landingPage.update({
        where: { id: projectId },
        data: { sandboxLastAccessedAt: new Date() },
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        \`[SandboxService] File write failed for project \${projectId}\`,
        error instanceof Error ? error : undefined
      );
      return {
        status: "error",
        message: errorMessage,
      };
    }
  }

  /**
   * Initializes a git repository if not already initialized
   */
  static async gitInitIfNeeded(
    projectId: string,
    userId: string
  ): Promise<GitOperationResult> {
    logger.debug(\`[SandboxService] Checking git init for project \${projectId}\`);

    const checkResult = await this.execCommand(
      projectId,
      userId,
      "test -d .git && echo 'exists' || echo 'not_exists'",
      10
    );

    if (checkResult.stdout.trim() === "exists") {
      return { success: true, details: "Git already initialized" };
    }

    const initResult = await this.execCommand(
      projectId,
      userId,
      'git init && git config user.email "agent@ideaspark.app" && git config user.name "IdeaSpark Agent"',
      30
    );

    if (initResult.status === "success") {
      return { success: true, details: "Git initialized successfully" };
    }

    return {
      success: false,
      details: \`Git init failed: \${initResult.stderr}\`,
    };
  }

  /**
   * Stages all changes for commit
   */
  static async gitAddAll(
    projectId: string,
    userId: string
  ): Promise<GitOperationResult> {
    logger.debug(\`[SandboxService] Running git add for project \${projectId}\`);

    const result = await this.execCommand(
      projectId,
      userId,
      "git add -A",
      30
    );

    if (result.status === "success") {
      return { success: true, details: "Files staged successfully" };
    }

    return {
      success: false,
      details: \`Git add failed: \${result.stderr}\`,
    };
  }

  /**
   * Creates a git commit
   */
  static async gitCommit(
    projectId: string,
    userId: string,
    message: string
  ): Promise<GitOperationResult> {
    logger.debug(\`[SandboxService] Creating commit for project \${projectId}\`);

    // Escape the commit message
    const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, "\\$");

    const result = await this.execCommand(
      projectId,
      userId,
      \`git commit -m "\${escapedMessage}"\`,
      60
    );

    // "nothing to commit" is considered a success
    if (
      result.status === "success" ||
      result.stdout.includes("nothing to commit")
    ) {
      return { success: true, details: "Commit successful or nothing to commit" };
    }

    return {
      success: false,
      details: \`Git commit failed: \${result.stderr}\`,
    };
  }

  /**
   * Pushes changes to a remote GitHub repository
   */
  static async gitPushToRepo(
    projectId: string,
    userId: string,
    repoUrl: string,
    accessToken: string
  ): Promise<GitOperationResult> {
    logger.info(\`[SandboxService] Pushing to repo for project \${projectId}\`);

    // Inject token into URL
    const urlWithAuth = repoUrl.replace(
      "https://",
      \`https://x-access-token:\${accessToken}@\`
    );

    // Check if remote exists
    const checkRemote = await this.execCommand(
      projectId,
      userId,
      "git remote get-url origin",
      10
    );

    let remoteCommand: string;
    if (checkRemote.status === "error") {
      remoteCommand = \`git remote add origin "\${urlWithAuth}"\`;
    } else {
      remoteCommand = \`git remote set-url origin "\${urlWithAuth}"\`;
    }

    const remoteResult = await this.execCommand(projectId, userId, remoteCommand, 30);
    if (remoteResult.status === "error") {
      return {
        success: false,
        message: "Failed to set remote",
        details: remoteResult.stderr,
      };
    }

    // Push to main branch
    const pushResult = await this.execCommand(
      projectId,
      userId,
      "git push -u origin main",
      120
    );

    if (pushResult.status === "success") {
      return { success: true, message: "Push successful" };
    }

    // Handle "everything up-to-date" as success
    if (pushResult.stderr.includes("up-to-date")) {
      return { success: true, message: "Repository already up to date" };
    }

    return {
      success: false,
      message: "Push failed",
      details: pushResult.stderr,
    };
  }
}
