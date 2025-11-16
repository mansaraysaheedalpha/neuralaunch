// src/lib/timeout.ts
/**
 * Global Timeout Configuration
 *
 * Prevents external API calls from hanging forever
 * Provides configurable timeouts for different operation types
 */

import { logger } from "./logger";

/**
 * Timeout configurations (in milliseconds)
 */
export const TIMEOUTS = {
  // AI API calls (can be slow due to generation)
  AI_GENERATION: 120000, // 2 minutes
  AI_EMBEDDING: 30000, // 30 seconds
  AI_CHAT: 60000, // 1 minute

  // External API calls
  EXTERNAL_API: 30000, // 30 seconds
  WEBHOOK: 10000, // 10 seconds

  // Database operations
  DATABASE_QUERY: 30000, // 30 seconds
  DATABASE_TRANSACTION: 60000, // 1 minute

  // File operations
  FILE_UPLOAD: 60000, // 1 minute
  FILE_DOWNLOAD: 60000, // 1 minute

  // GitHub operations
  GITHUB_API: 30000, // 30 seconds

  // Docker operations
  DOCKER_BUILD: 300000, // 5 minutes
  DOCKER_START: 60000, // 1 minute
  DOCKER_STOP: 30000, // 30 seconds

  // Default timeout for unknown operations
  DEFAULT: 30000, // 30 seconds
} as const;

/**
 * Custom timeout error
 */
export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Execute a function with a timeout
 *
 * @param fn - The function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operation - Name of the operation (for logging)
 * @returns The result of the function
 * @throws TimeoutError if the operation times out
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operation = "unknown"
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      logger.error(`Timeout: ${operation} exceeded ${timeoutMs}ms`);
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Execute a fetch request with timeout
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds
 * @returns Fetch response
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUTS.EXTERNAL_API
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === "AbortError") {
      throw new TimeoutError(`fetch ${url}`, timeoutMs);
    }
    throw error;
  }
}

/**
 * Create a timeout wrapper for AI operations
 */
export function withAITimeout<T>(
  fn: () => Promise<T>,
  operation = "AI operation"
): Promise<T> {
  return withTimeout(fn, TIMEOUTS.AI_GENERATION, operation);
}

/**
 * Create a timeout wrapper for external API calls
 */
export function withExternalAPITimeout<T>(
  fn: () => Promise<T>,
  operation = "External API"
): Promise<T> {
  return withTimeout(fn, TIMEOUTS.EXTERNAL_API, operation);
}
