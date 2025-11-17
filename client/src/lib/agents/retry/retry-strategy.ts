// src/lib/agents/retry/retry-strategy.ts
/**
 * Dynamic Retry Strategy
 * Determines retry limits based on task complexity, cost, and time
 */

import { logger } from "@/lib/logger";

// ==========================================
// TYPES
// ==========================================

export interface RetryConfig {
  // Complexity-based limits
  maxIterations: number;

  // Cost-based limits (USD)
  maxCostDollars: number;
  estimatedCostPerIteration: number;

  // Time-based limits (milliseconds)
  maxDurationMs: number;

  // Metadata
  taskComplexity: "simple" | "medium";
  estimatedLines: number;
}

export interface RetryDecision {
  shouldRetry: boolean;
  reason: string;
  currentIteration: number;
  maxIterations: number;
  costsExceeded: boolean;
  timeExceeded: boolean;
  recommendedAction: "retry" | "escalate" | "error_recovery";
}

// ==========================================
// RETRY STRATEGY CLASS
// ==========================================

export class DynamicRetryStrategy {
  private readonly name = "DynamicRetryStrategy";

  // Default limits by complexity
  private readonly DEFAULT_LIMITS = {
    simple: {
      maxIterations: 3,
      maxCostDollars: 0.5,
      maxDurationMs: 5 * 60 * 1000, // 5 minutes
    },
    medium: {
      maxIterations: 5,
      maxCostDollars: 1.0,
      maxDurationMs: 10 * 60 * 1000, // 10 minutes
    },
  };

  // AI model costs (approximate)
  private readonly MODEL_COSTS: Record<
    string,
    {
      inputPerMillion: number;
      outputPerMillion: number;
      avgTokensPerIteration: number;
    }
  > = {
    "gemini-2.0-flash-exp": {
      inputPerMillion: 0.075, // $0.075 per 1M input tokens
      outputPerMillion: 0.3, // $0.30 per 1M output tokens
      avgTokensPerIteration: 8000, // ~4K input + 4K output
    },
    "gemini-2.5-pro": {
      inputPerMillion: 1.25,
      outputPerMillion: 5.0,
      avgTokensPerIteration: 8000,
    },
    // ✅ ADD CLAUDE MODELS:
    "claude-sonnet-4-20250514": {
      inputPerMillion: 3.0, // $3 per 1M input tokens
      outputPerMillion: 15.0, // $15 per 1M output tokens
      avgTokensPerIteration: 8000,
    },
    "claude-sonnet-4-5-20250929": {
      inputPerMillion: 3.0, // $3 per 1M input tokens
      outputPerMillion: 15.0, // $15 per 1M output tokens
      avgTokensPerIteration: 8000,
    },
    "claude-opus-4-20250514": {
      inputPerMillion: 15.0, // $15 per 1M input tokens
      outputPerMillion: 75.0, // $75 per 1M output tokens
      avgTokensPerIteration: 8000,
    },
  };

  /**
   * Get retry configuration for a task
   */
  getRetryConfig(
    complexity: "simple" | "medium",
    estimatedLines: number,
    modelName: string = "gemini-2.0-flash-exp"
  ): RetryConfig {
    const limits = this.DEFAULT_LIMITS[complexity];

    // ✅ ADD: Better fallback for unknown models
    let modelCost = this.MODEL_COSTS[modelName];

    if (!modelCost) {
      logger.warn(
        `[${this.name}] Unknown model: ${modelName}, using Gemini Flash defaults`,
        {
          modelName,
          availableModels: Object.keys(this.MODEL_COSTS),
        }
      );
      modelCost = this.MODEL_COSTS["gemini-2.0-flash-exp"];
    }

    // Calculate estimated cost per iteration
    const avgTokens = modelCost.avgTokensPerIteration;
    const inputCost = (avgTokens / 2 / 1_000_000) * modelCost.inputPerMillion;
    const outputCost = (avgTokens / 2 / 1_000_000) * modelCost.outputPerMillion;
    const estimatedCostPerIteration = inputCost + outputCost;

    // Adjust iterations based on estimated lines
    let maxIterations = limits.maxIterations;
    if (estimatedLines > 200 && complexity === "simple") {
      maxIterations = Math.min(maxIterations + 1, 5);
    }

    return {
      maxIterations,
      maxCostDollars: limits.maxCostDollars,
      estimatedCostPerIteration,
      maxDurationMs: limits.maxDurationMs,
      taskComplexity: complexity,
      estimatedLines,
    };
  }

  /**
   * Decide if task should retry or escalate
   */
  shouldRetry(
    currentIteration: number,
    totalDurationMs: number,
    config: RetryConfig
  ): RetryDecision {
    const costsExceeded =
      currentIteration * config.estimatedCostPerIteration >=
      config.maxCostDollars;
    const timeExceeded = totalDurationMs >= config.maxDurationMs;
    const iterationsExceeded = currentIteration >= config.maxIterations;

    // Check each limit
    if (iterationsExceeded) {
      logger.warn(
        `[${this.name}] Max iterations exceeded: ${currentIteration}/${config.maxIterations}`
      );
      return {
        shouldRetry: false,
        reason: `Reached maximum ${config.maxIterations} iterations`,
        currentIteration,
        maxIterations: config.maxIterations,
        costsExceeded,
        timeExceeded,
        recommendedAction: "error_recovery",
      };
    }

    if (costsExceeded) {
      logger.warn(
        `[${this.name}] Cost limit exceeded: $${(currentIteration * config.estimatedCostPerIteration).toFixed(2)}/$${config.maxCostDollars}`
      );
      return {
        shouldRetry: false,
        reason: `Cost limit exceeded ($${config.maxCostDollars})`,
        currentIteration,
        maxIterations: config.maxIterations,
        costsExceeded: true,
        timeExceeded,
        recommendedAction: "error_recovery",
      };
    }

    if (timeExceeded) {
      logger.warn(
        `[${this.name}] Time limit exceeded: ${totalDurationMs}ms/${config.maxDurationMs}ms`
      );
      return {
        shouldRetry: false,
        reason: `Time limit exceeded (${config.maxDurationMs / 60000} minutes)`,
        currentIteration,
        maxIterations: config.maxIterations,
        costsExceeded,
        timeExceeded: true,
        recommendedAction: "error_recovery",
      };
    }

    // All limits OK, can retry
    logger.info(
      `[${this.name}] Retry OK - iteration ${currentIteration + 1}/${config.maxIterations}`
    );
    return {
      shouldRetry: true,
      reason: `Within limits (${currentIteration + 1}/${config.maxIterations} iterations)`,
      currentIteration,
      maxIterations: config.maxIterations,
      costsExceeded: false,
      timeExceeded: false,
      recommendedAction: "retry",
    };
  }

  /**
   * Get retry strategy summary for logging
   */
  getStrategySummary(config: RetryConfig): string {
    return `
Retry Strategy:
- Complexity: ${config.taskComplexity}
- Max Iterations: ${config.maxIterations}
- Max Cost: $${config.maxCostDollars}
- Max Duration: ${config.maxDurationMs / 60000} minutes
- Est. Cost/Iteration: $${config.estimatedCostPerIteration.toFixed(4)}
    `.trim();
  }

  /**
   * Calculate actual cost based on token usage
   */
  calculateActualCost(
    inputTokens: number,
    outputTokens: number,
    modelName: string = "gemini-2.0-flash-exp"
  ): number {
    const modelCost =
      this.MODEL_COSTS[modelName] || this.MODEL_COSTS["gemini-2.0-flash-exp"];

    const inputCost = (inputTokens / 1_000_000) * modelCost.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * modelCost.outputPerMillion;

    return inputCost + outputCost;
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const retryStrategy = new DynamicRetryStrategy();
