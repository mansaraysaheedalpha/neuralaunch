// Environment Validator - Ensures agent environment is properly initialized
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { SandboxService } from "@/lib/services/sandbox-service";
import { sendNotification } from "@/lib/notifications/notification-service";

export interface EnvironmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that the environment is ready for agent execution
 * This checks:
 * - Project exists in database
 * - Sandbox can be created/accessed
 * - Basic file system operations work
 */
export async function validateEnvironment(
  projectId: string,
  userId: string
): Promise<EnvironmentValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // 1. Check if project exists
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) {
      errors.push("Project not found or user does not have access");
      return { valid: false, errors, warnings };
    }

    // 2. Check if sandbox can be initialized
    try {
      await SandboxService.gitInitIfNeeded(projectId, userId);
      logger.info(`[EnvironmentValidator] Sandbox initialized for project ${projectId}`);
    } catch (sandboxError) {
      const errorMsg = sandboxError instanceof Error ? sandboxError.message : String(sandboxError);
      errors.push(`Failed to initialize sandbox: ${errorMsg}`);

      // Send escalation notification
      await sendNotification({
        userId,
        projectId,
        type: "escalation",
        priority: "critical",
        title: "Environment Initialization Failed",
        message: `The agent is unable to access or parse the project's file system. This is a fundamental environment or sandbox issue, preventing the agent from starting any work on the task.`,
        escalationReason: errorMsg,
        attempts: 3,
      }).catch(notifError => {
        logger.error("[EnvironmentValidator] Failed to send escalation notification",
          notifError instanceof Error ? notifError : undefined);
      });

      return { valid: false, errors, warnings };
    }

    // 3. Test basic file system operations
    try {
      // Try to write a test file
      const testResult = await SandboxService.writeFile(
        projectId,
        userId,
        ".neuralaunch-test",
        "Environment validation test"
      );

      if (testResult.status === "error") {
        errors.push(`File system test failed: ${testResult.message}`);
        return { valid: false, errors, warnings };
      }

      logger.info(`[EnvironmentValidator] File system test passed for project ${projectId}`);
    } catch (fsError) {
      const errorMsg = fsError instanceof Error ? fsError.message : String(fsError);
      errors.push(`File system access test failed: ${errorMsg}`);
      return { valid: false, errors, warnings };
    }

    // All checks passed
    return { valid: true, errors: [], warnings };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Environment validation failed: ${errorMsg}`);
    return { valid: false, errors, warnings };
  }
}

/**
 * Validate environment and throw error if invalid
 */
export async function ensureEnvironmentReady(
  projectId: string,
  userId: string
): Promise<void> {
  const validation = await validateEnvironment(projectId, userId);

  if (!validation.valid) {
    const errorMessage = `Environment validation failed:\n${validation.errors.join("\n")}`;
    logger.error("[EnvironmentValidator] Environment not ready", undefined, {
      projectId,
      errors: validation.errors
    });
    throw new Error(errorMessage);
  }

  if (validation.warnings.length > 0) {
    logger.warn("[EnvironmentValidator] Environment warnings", {
      projectId,
      warnings: validation.warnings
    });
  }

  logger.info(`[EnvironmentValidator] Environment ready for project ${projectId}`);
}
