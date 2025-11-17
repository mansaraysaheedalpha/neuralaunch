// src/lib/agents/utils/sandbox-retry.ts
import { logger } from "@/lib/logger";

export async function withSandboxRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3,
  delayMs = 3000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `[SandboxRetry] Attempting ${operationName} (${attempt}/${maxRetries})`
      );
      const result = await operation();

      if (attempt > 1) {
        logger.info(
          `[SandboxRetry] ${operationName} succeeded on attempt ${attempt}`
        );
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        logger.error(
          `[SandboxRetry] ${operationName} failed after ${maxRetries} attempts`,
          lastError
        );
        break;
      }

      const waitTime = delayMs * attempt; // Exponential backoff
      logger.warn(
        `[SandboxRetry] ${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`,
        {
          error: lastError.message,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw (
    lastError ||
    new Error(`${operationName} failed after ${maxRetries} retries`)
  );
}
