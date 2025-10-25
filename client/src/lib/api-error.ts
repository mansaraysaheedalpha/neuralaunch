// src/lib/api-error.ts
/**
 * API Error Handling Utilities
 * 
 * Provides consistent error handling and logging for API routes
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

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
  }
}

/**
 * Log error with context
 */
function logError(error: unknown, context?: string): void {
  const timestamp = new Date().toISOString();
  const prefix = context ? `[${context}]` : "";
  
  console.error(`${timestamp} ${prefix} Error:`, error);
  
  // In production, you would send this to a logging service
  // like Sentry, LogRocket, or CloudWatch
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
        details: error.errors.map((e) => ({
          path: e.path.join("."),
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
