// src/lib/logger.ts
/**
 * Logging Utility
 * 
 * Provides structured logging throughout the application
 * In production, logs can be sent to external services (e.g., Sentry, LogRocket)
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";
  private isProduction = process.env.NODE_ENV === "production";

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  /**
   * Log informational messages
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.info(this.formatMessage("info", message, context));
    }
    // In production, send to logging service
    if (this.isProduction) {
      this.sendToLoggingService("info", message, context);
    }
  }

  /**
   * Log warnings
   */
  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage("warn", message, context));
    
    if (this.isProduction) {
      this.sendToLoggingService("warn", message, context);
    }
  }

  /**
   * Log errors
   */
  error(message: string, err?: Error, context?: LogContext): void {
    const errorContext: LogContext = {
      ...context,
      ...(err instanceof Error && {
        errorName: err.name,
        errorMessage: err.message,
        errorStack: err.stack,
      }),
    };

    console.error(this.formatMessage("error", message, errorContext));

    if (this.isProduction) {
      this.sendToLoggingService("error", message, errorContext);
    }
  }

  /**
   * Send logs to external logging service
   * Implement integration with your logging service here
   */
  private sendToLoggingService(
    _level: LogLevel,
    _message: string,
    _context?: LogContext
  ): void {
    // Example: Send to Sentry, LogRocket, or CloudWatch
    // For now, this is a placeholder
    
    // Example Sentry integration:
    // if (level === "error") {
    //   Sentry.captureMessage(message, {
    //     level: level as SeverityLevel,
    //     extra: context,
    //   });
    // }
  }

  /**
   * Create a child logger with persistent context
   */
  child(persistentContext: LogContext): Logger {
    const childLogger = new Logger();
    const originalMethods = {
      debug: childLogger.debug.bind(childLogger),
      info: childLogger.info.bind(childLogger),
      warn: childLogger.warn.bind(childLogger),
      error: childLogger.error.bind(childLogger),
    };

    childLogger.debug = (message: string, context?: LogContext) =>
      originalMethods.debug(message, { ...persistentContext, ...context });

    childLogger.info = (message: string, context?: LogContext) =>
      originalMethods.info(message, { ...persistentContext, ...context });

    childLogger.warn = (message: string, context?: LogContext) =>
      originalMethods.warn(message, { ...persistentContext, ...context });

    childLogger.error = (
      message: string,
      err?: Error,
      context?: LogContext
    ) => originalMethods.error(message, err, { ...persistentContext, ...context });

    return childLogger;
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Create an API logger with request context
 */
export function createApiLogger(context: {
  path: string;
  method: string;
  userId?: string;
}): Logger {
  return logger.child({
    type: "api",
    ...context,
  });
}
