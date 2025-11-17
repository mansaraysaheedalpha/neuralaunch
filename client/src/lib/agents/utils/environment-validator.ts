// src/lib/agents/utils/environment-validator.ts
// Environment Validator - Ensures agent environment is properly initialized
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { SandboxService } from "@/lib/services/sandbox-service";

export interface EnvironmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that the environment is ready for agent execution
 * This checks:
 * - Project exists in database
 * - Sandbox can be created/accessed (with warnings, not failures)
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

    // 2. Check if sandbox can be initialized (but don't fail validation if slow)
    try {
      await SandboxService.gitInitIfNeeded(projectId, userId);
      logger.info(
        `[EnvironmentValidator] Sandbox initialized for project ${projectId}`
      );
    } catch (sandboxError) {
      const errorMsg =
        sandboxError instanceof Error
          ? sandboxError.message
          : String(sandboxError);

      // ✅ CHANGED: Don't fail validation, just add a warning
      warnings.push(`Sandbox initialization pending or slow: ${errorMsg}`);
      logger.warn(
        `[EnvironmentValidator] Sandbox not immediately ready, agents will retry during execution`,
        {
          projectId,
          error: errorMsg,
        }
      );

      // Note: We don't send escalation notification here anymore
      // Agents will handle sandbox availability with retry logic
    }

    // 3. ✅ REMOVED: File system test - too aggressive for initial validation
    // The actual execution agents will handle sandbox availability with proper retry logic
    // This prevents false failures due to network latency or container startup time

    // All checks passed (or have warnings)
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
      errors: validation.errors,
    });
    throw new Error(errorMessage);
  }

  if (validation.warnings.length > 0) {
    logger.warn("[EnvironmentValidator] Environment warnings", {
      projectId,
      warnings: validation.warnings,
    });
  }

  logger.info(
    `[EnvironmentValidator] Environment ready for project ${projectId}`
  );
}
