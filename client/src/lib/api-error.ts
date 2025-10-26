// src/lib/api-error.ts
/**
 * API Error Handling Utilities
 * 
 * Provides consistent error handling and logging for API routes
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "./logger";

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  details?: unknown;
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Validation error class
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
    this.name = "ValidationError";
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends ApiError {
  constructor(message = "Authentication required") {
    super(401, message);
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends ApiError {
  constructor(message = "You do not have permission to access this resource") {
    super(403, message);
    this.name = "AuthorizationError";
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends ApiError {
  constructor(resource = "Resource") {
    super(404, `${resource} not found`);
    this.name = "NotFoundError";
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends ApiError {
  constructor(retryAfter?: number) {
    super(429, "Too many requests. Please try again later.", { retryAfter });
    this.name = "RateLimitError";
  }
}

/**
 * External service error class
 */
export class ExternalServiceError extends ApiError {
  constructor(service: string, message?: string) {
    super(503, message || `External service ${service} is unavailable`);
    this.name = "ExternalServiceError";
  }
}

/**
 * Log error with context using the centralized logger
 */
function logError(error: unknown, context?: string): void {
  if (error instanceof Error) {
    logger.error(
      context || "API Error",
      error,
      {
        errorName: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode }),
      }
    );
  } else {
    logger.error(
      context || "API Error",
      undefined,
      { error: String(error) }
    );
  }
}

/**
 * Convert various error types to a standardized API error response
 */
export function handleApiError(
  error: unknown,
  context?: string
): NextResponse<ApiErrorResponse> {
  logError(error, context);

  // Handle custom API errors
  if (error instanceof ApiError) {
    return NextResponse.json<ApiErrorResponse>(
      {
        error: error.name,
        message: error.message,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString(),
        details: error.details,
      },
      { status: error.statusCode }
    );
  }

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    return NextResponse.json<ApiErrorResponse>(
      {
        error: "ValidationError",
        message: "Invalid request data",
        statusCode: 400,
        timestamp: new Date().toISOString(),
        details: error.issues.map((e) => ({
          path: String(e.path.join(".")),
          message: e.message,
        })),
      },
      { status: 400 }
    );
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json<ApiErrorResponse>(
        {
          error: "DuplicateError",
          message: "A record with this value already exists",
          statusCode: 409,
          timestamp: new Date().toISOString(),
        },
        { status: 409 }
      );
    }

    // Record not found
    if (error.code === "P2025") {
      return NextResponse.json<ApiErrorResponse>(
        {
          error: "NotFoundError",
          message: "The requested resource was not found",
          statusCode: 404,
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    // Foreign key constraint violation
    if (error.code === "P2003") {
      return NextResponse.json<ApiErrorResponse>(
        {
          error: "ReferenceError",
          message: "Invalid reference to related resource",
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }
  }

  // Handle Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json<ApiErrorResponse>(
      {
        error: "ValidationError",
        message: "Invalid data provided to database",
        statusCode: 400,
        timestamp: new Date().toISOString(),
      },
      { status: 400 }
    );
  }

  // Handle standard JavaScript errors
  if (error instanceof Error) {
    // Don't expose internal error details in production
    const isProduction = process.env.NODE_ENV === "production";
    
    return NextResponse.json<ApiErrorResponse>(
      {
        error: "InternalServerError",
        message: isProduction 
          ? "An unexpected error occurred" 
          : error.message,
        statusCode: 500,
        timestamp: new Date().toISOString(),
        details: isProduction ? undefined : { stack: error.stack },
      },
      { status: 500 }
    );
  }

  // Handle unknown errors
  return NextResponse.json<ApiErrorResponse>(
    {
      error: "UnknownError",
      message: "An unexpected error occurred",
      statusCode: 500,
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}

/**
 * Async error handler wrapper for API routes
 * Automatically catches and handles errors
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  context?: string
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, context);
    }
  };
}

/**
 * Common error responses
 */
export const ErrorResponses = {
  unauthorized: () =>
    new NextResponse(
      JSON.stringify({
        error: "Unauthorized",
        message: "You must be logged in to access this resource",
        statusCode: 401,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    ),

  forbidden: (message = "You do not have permission to access this resource") =>
    new NextResponse(
      JSON.stringify({
        error: "Forbidden",
        message,
        statusCode: 403,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    ),

  notFound: (resource = "Resource") =>
    new NextResponse(
      JSON.stringify({
        error: "NotFound",
        message: `${resource} not found`,
        statusCode: 404,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    ),

  badRequest: (message = "Invalid request") =>
    new NextResponse(
      JSON.stringify({
        error: "BadRequest",
        message,
        statusCode: 400,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    ),

  rateLimitExceeded: (retryAfter?: number) =>
    new NextResponse(
      JSON.stringify({
        error: "RateLimitExceeded",
        message: "Too many requests. Please try again later.",
        statusCode: 429,
        timestamp: new Date().toISOString(),
        details: retryAfter ? { retryAfter } : undefined,
      }),
      { 
        status: 429,
        headers: { 
          "Content-Type": "application/json",
          ...(retryAfter ? { "Retry-After": retryAfter.toString() } : {}),
        },
      }
    ),

  methodNotAllowed: (allowedMethods: string[]) =>
    new NextResponse(
      JSON.stringify({
        error: "MethodNotAllowed",
        message: `Method not allowed. Allowed methods: ${allowedMethods.join(", ")}`,
        statusCode: 405,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 405,
        headers: { 
          "Content-Type": "application/json",
          "Allow": allowedMethods.join(", "),
        },
      }
    ),
} as const;

/**
 * Timeout error
 */
export class TimeoutError extends ApiError {
  constructor(operation: string, timeoutMs: number) {
    super(504, `Operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param operation Name of the operation for error messages
 * @returns Promise that rejects with TimeoutError if timeout is exceeded
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation = "Operation"
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param initialDelayMs Initial delay in milliseconds
 * @param maxDelayMs Maximum delay in milliseconds
 * @returns Result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1000,
  maxDelayMs = 10000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx)
      if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }
      
      // Don't retry if this was the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate exponential backoff delay
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: error instanceof Error ? error.message : String(error),
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Safely execute an async operation with comprehensive error handling
 * Combines timeout, retry, and error handling
 */
export async function safeAsyncOperation<T>(
  operation: () => Promise<T>,
  options: {
    operationName?: string;
    timeoutMs?: number;
    retries?: number;
    onError?: (error: unknown) => void;
  } = {}
): Promise<T> {
  const {
    operationName = "Async operation",
    timeoutMs,
    retries = 0,
    onError,
  } = options;

  try {
    let promise = operation();
    
    // Apply retry if configured
    if (retries > 0) {
      promise = withRetry(() => operation(), retries);
    }
    
    // Apply timeout if configured
    if (timeoutMs) {
      promise = withTimeout(promise, timeoutMs, operationName);
    }
    
    return await promise;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
}
