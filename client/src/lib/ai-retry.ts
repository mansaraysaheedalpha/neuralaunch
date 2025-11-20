// src/lib/ai-retry.ts
/**
 * Centralized AI API Retry Utility
 *
 * Provides robust retry logic with exponential backoff for all LLM API calls.
 * Handles transient errors, rate limits, and overload situations gracefully.
 */

import { logger } from "./logger";

// ==========================================
// RETRY CONFIGURATION
// ==========================================

export interface RetryOptions {
  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds (default: 2000ms)
   */
  initialDelayMs?: number;

  /**
   * Maximum delay in milliseconds (default: 30000ms = 30s)
   */
  maxDelayMs?: number;

  /**
   * Backoff multiplier (default: 2 for exponential backoff)
   */
  backoffMultiplier?: number;

  /**
   * Add random jitter to prevent thundering herd (default: true)
   */
  enableJitter?: boolean;

  /**
   * Maximum jitter in milliseconds (default: 1000ms)
   */
  maxJitterMs?: number;

  /**
   * Custom function to determine if error is retryable
   */
  isRetryable?: (error: Error) => boolean;

  /**
   * Callback for each retry attempt
   */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;

  /**
   * Operation name for logging
   */
  operationName?: string;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDurationMs: number;
}

// ==========================================
// ERROR CLASSIFICATION
// ==========================================

export enum ErrorType {
  /**
   * API is overloaded (529, should retry with longer backoff)
   */
  OVERLOADED = "OVERLOADED",

  /**
   * Rate limit exceeded (429, should retry with exponential backoff)
   */
  RATE_LIMIT = "RATE_LIMIT",

  /**
   * Temporary server error (500, 502, 503, should retry)
   */
  SERVER_ERROR = "SERVER_ERROR",

  /**
   * Network/timeout error (should retry)
   */
  NETWORK_ERROR = "NETWORK_ERROR",

  /**
   * Invalid API key or authentication (should NOT retry)
   */
  AUTH_ERROR = "AUTH_ERROR",

  /**
   * Invalid request format (should NOT retry)
   */
  CLIENT_ERROR = "CLIENT_ERROR",

  /**
   * Unknown error
   */
  UNKNOWN = "UNKNOWN",
}

/**
 * Classify error type based on error message and status code
 */
export function classifyError(error: unknown): ErrorType {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorMessageLower = errorMessage.toLowerCase();

  // Check for overload errors (529)
  if (
    errorMessageLower.includes("overload") ||
    errorMessageLower.includes("529") ||
    errorMessage.includes('"type":"overloaded_error"')
  ) {
    return ErrorType.OVERLOADED;
  }

  // Check for rate limits (429)
  if (
    errorMessageLower.includes("rate limit") ||
    errorMessageLower.includes("429") ||
    errorMessageLower.includes("too many requests")
  ) {
    return ErrorType.RATE_LIMIT;
  }

  // Check for server errors (500, 502, 503)
  if (
    errorMessageLower.includes("500") ||
    errorMessageLower.includes("502") ||
    errorMessageLower.includes("503") ||
    errorMessageLower.includes("bad gateway") ||
    errorMessageLower.includes("service unavailable") ||
    errorMessageLower.includes("internal server error")
  ) {
    return ErrorType.SERVER_ERROR;
  }

  // Check for network/timeout errors
  if (
    errorMessageLower.includes("timeout") ||
    errorMessageLower.includes("econnreset") ||
    errorMessageLower.includes("etimedout") ||
    errorMessageLower.includes("econnrefused") ||
    errorMessageLower.includes("network") ||
    errorMessageLower.includes("socket hang up")
  ) {
    return ErrorType.NETWORK_ERROR;
  }

  // Check for authentication errors
  if (
    errorMessageLower.includes("invalid api key") ||
    errorMessageLower.includes("unauthorized") ||
    errorMessageLower.includes("401") ||
    errorMessageLower.includes("403") ||
    errorMessageLower.includes("authentication failed")
  ) {
    return ErrorType.AUTH_ERROR;
  }

  // Check for client errors (400, 404)
  if (
    errorMessageLower.includes("400") ||
    errorMessageLower.includes("404") ||
    errorMessageLower.includes("bad request") ||
    errorMessageLower.includes("invalid request") ||
    errorMessageLower.includes("validation error")
  ) {
    return ErrorType.CLIENT_ERROR;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Determine if an error is retryable based on its type
 */
export function isRetryableError(error: unknown): boolean {
  const errorType = classifyError(error);

  switch (errorType) {
    case ErrorType.OVERLOADED:
    case ErrorType.RATE_LIMIT:
    case ErrorType.SERVER_ERROR:
    case ErrorType.NETWORK_ERROR:
      return true;

    case ErrorType.AUTH_ERROR:
    case ErrorType.CLIENT_ERROR:
      return false;

    case ErrorType.UNKNOWN:
      // For unknown errors, retry to be safe
      return true;

    default:
      return false;
  }
}

/**
 * Get recommended delay multiplier based on error type
 */
function getDelayMultiplierForError(error: unknown): number {
  const errorType = classifyError(error);

  switch (errorType) {
    case ErrorType.OVERLOADED:
      // Longer backoff for overloaded servers
      return 3;

    case ErrorType.RATE_LIMIT:
      // Exponential backoff for rate limits
      return 2.5;

    case ErrorType.SERVER_ERROR:
    case ErrorType.NETWORK_ERROR:
      // Standard exponential backoff
      return 2;

    default:
      return 2;
  }
}

// ==========================================
// RETRY UTILITY
// ==========================================

/**
 * Calculate delay for next retry attempt with exponential backoff and jitter
 */
export function calculateRetryDelay(
  attempt: number,
  options: RetryOptions,
  error?: unknown
): number {
  const {
    initialDelayMs = 2000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    enableJitter = true,
    maxJitterMs = 1000,
  } = options;

  // Get error-specific multiplier
  const errorMultiplier = error ? getDelayMultiplierForError(error) : backoffMultiplier;

  // Calculate base exponential delay
  const exponentialDelay = initialDelayMs * Math.pow(errorMultiplier, attempt - 1);

  // Add jitter to prevent thundering herd
  const jitter = enableJitter ? Math.random() * maxJitterMs : 0;

  // Cap at maximum delay
  const totalDelay = Math.min(exponentialDelay + jitter, maxDelayMs);

  return totalDelay;
}

/**
 * Execute an async operation with retry logic and exponential backoff
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => anthropic.messages.create({ model: "claude-3", ... }),
 *   { maxRetries: 3, operationName: "Claude API call" }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    isRetryable = isRetryableError,
    onRetry,
    operationName = "AI operation",
  } = options;

  const startTime = Date.now();
  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;

    try {
      logger.debug(`[AI Retry] Attempting ${operationName} (${attempt}/${maxRetries + 1})`);

      const result = await operation();

      const totalDuration = Date.now() - startTime;

      if (attempt > 1) {
        logger.info(
          `[AI Retry] ✅ ${operationName} succeeded on attempt ${attempt}`,
          {
            attempts: attempt,
            totalDurationMs: totalDuration,
          }
        );
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorType = classifyError(lastError);
      const retryable = isRetryable(lastError);

      logger.warn(
        `[AI Retry] ❌ ${operationName} failed on attempt ${attempt}/${maxRetries + 1}`,
        {
          error: lastError.message,
          errorType,
          retryable,
          willRetry: retryable && attempt <= maxRetries,
        }
      );

      // If not retryable, fail immediately
      if (!retryable) {
        logger.error(
          `[AI Retry] ⛔ ${operationName} failed with non-retryable error`,
          lastError,
          { errorType }
        );
        throw lastError;
      }

      // If we've exhausted retries, fail
      if (attempt > maxRetries) {
        const totalDuration = Date.now() - startTime;
        logger.error(
          `[AI Retry] ⛔ ${operationName} failed after ${attempt} attempts`,
          lastError,
          {
            totalDurationMs: totalDuration,
            errorType,
          }
        );
        throw new Error(
          `${operationName} failed after ${attempt} attempts: ${lastError.message}`
        );
      }

      // Calculate delay and wait before retry
      const delayMs = calculateRetryDelay(attempt, options, lastError);

      logger.info(
        `[AI Retry] ⏳ Waiting ${Math.round(delayMs / 1000)}s before retry ${attempt + 1}/${maxRetries + 1}`,
        {
          delayMs: Math.round(delayMs),
          errorType,
          nextAttempt: attempt + 1,
        }
      );

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, lastError, delayMs);
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error(`${operationName} failed after ${attempt} attempts`);
}

/**
 * Execute an operation with retry logic and return detailed result
 * (non-throwing variant)
 */
export async function retryWithBackoffSafe<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  try {
    const result = await retryWithBackoff(operation, {
      ...options,
      onRetry: (attempt, error, delayMs) => {
        attempts = attempt;
        options.onRetry?.(attempt, error, delayMs);
      },
    });

    return {
      success: true,
      data: result,
      attempts: attempts + 1,
      totalDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      attempts: attempts + 1,
      totalDurationMs: Date.now() - startTime,
    };
  }
}

// ==========================================
// SPECIALIZED RETRY CONFIGURATIONS
// ==========================================

/**
 * Preset retry options for different scenarios
 */
export const RetryPresets = {
  /**
   * Standard retry for most LLM API calls
   */
  STANDARD: {
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    enableJitter: true,
  } as RetryOptions,

  /**
   * Aggressive retry for critical operations
   */
  AGGRESSIVE: {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    enableJitter: true,
  } as RetryOptions,

  /**
   * Conservative retry for rate-limited APIs
   */
  CONSERVATIVE: {
    maxRetries: 2,
    initialDelayMs: 5000,
    maxDelayMs: 45000,
    backoffMultiplier: 3,
    enableJitter: true,
  } as RetryOptions,

  /**
   * Quick retry for fast operations
   */
  QUICK: {
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    enableJitter: true,
  } as RetryOptions,
};
