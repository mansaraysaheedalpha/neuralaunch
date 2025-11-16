// src/lib/error-utils.ts
/**
 * Error Utilities
 * 
 * Helper functions to properly handle error types in TypeScript
 */

import { LogContext } from "./logger";

/**
 * Safely convert unknown error to Error instance
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  
  if (typeof error === "string") {
    return new Error(error);
  }
  
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String(error.message));
  }
  
  return new Error("Unknown error occurred");
}

/**
 * Safely convert unknown error to LogContext
 */
export function toLogContext(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }
  
  if (typeof error === "string") {
    return { error };
  }
  
  if (error && typeof error === "object") {
    return { error: JSON.stringify(error) };
  }
  
  return { error: "Unknown error" };
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  
  return "Unknown error occurred";
}

/**
 * Create an enriched error with additional context
 */
export function createContextError(
  message: string,
  context: Record<string, unknown>,
  originalError?: unknown
): Error {
  const error = new Error(message);
  
  // Attach context as additional properties (non-standard but useful for logging)
  Object.assign(error, { context });
  
  if (originalError) {
    Object.assign(error, { 
      originalError: originalError instanceof Error
        ? originalError.message
        : typeof originalError === "object"
          ? JSON.stringify(originalError)
          : typeof originalError === "string"
            ? originalError
            : typeof originalError === "object"
              ? JSON.stringify(originalError)
              : JSON.stringify(originalError)
    });
  }
  
  return error;
}

/**
 * Extended Error types for agent operations
 */
export interface AgentError extends Error {
  taskId?: string;
  projectId?: string;
  error?: unknown;
  duration?: number;
  tool?: string;
}

/**
 * Create an agent error with taskId
 */
export function createAgentError(
  message: unknown,
  context?: { taskId?: string; projectId?: string; error?: unknown; duration?: number; tool?: string }
): AgentError {
  const errorMessage = typeof message === "string" ? message : getErrorMessage(message);
  const error = new Error(errorMessage) as AgentError;
  if (context) {
    if (context.taskId) error.taskId = context.taskId;
    if (context.projectId) error.projectId = context.projectId;
    if (context.error) error.error = context.error;
    if (context.duration !== undefined) error.duration = context.duration;
    if (context.tool) error.tool = context.tool;
  }
  return error;
}
