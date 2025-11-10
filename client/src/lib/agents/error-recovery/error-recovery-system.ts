// src/lib/agents/error-recovery/error-recovery-system.ts
/**
 * Error Recovery System
 * Handles task failures intelligently with AI analysis and human escalation
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { AI_MODELS } from "@/lib/models";
import { toError, toLogContext } from "@/lib/error-utils";

// ==========================================
// TYPES
// ==========================================

export interface FailureAttempt {
  iteration: number;
  error: string;
  stdout?: string;
  stderr?: string;
  filesAttempted?: string[];
  timestamp: Date;
}

export interface ErrorAnalysis {
  rootCause: string;
  category:
    | "syntax"
    | "logic"
    | "dependency"
    | "environment"
    | "complexity"
    | "unknown";
  severity: "low" | "medium" | "high" | "critical";
  suggestions: string[];
  canAutoRecover: boolean;
  requiresHuman: boolean;
  simplificationNeeded: boolean;
}

export interface RecoveryStrategy {
  action: "retry" | "simplify" | "split" | "human_review" | "escalate";
  reason: string;
  modifications?: {
    simplifiedPrompt?: string;
    splitTasks?: Array<{
      title: string;
      description: string;
      estimatedLines: number;
    }>;
  };
}

export interface RecoveryInput {
  taskId: string;
  projectId: string;
  userId: string;
  conversationId: string;
  originalTask: any;
  failures: FailureAttempt[];
  maxIterationsReached: boolean;
}

export interface RecoveryOutput {
  success: boolean;
  strategy: RecoveryStrategy;
  analysis: ErrorAnalysis;
  nextAction: string;
}

// ==========================================
// ERROR RECOVERY CLASS
// ==========================================

export class ErrorRecoverySystem {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private readonly name = "ErrorRecoverySystem";

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY required for ErrorRecoverySystem");
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: AI_MODELS.PRIMARY,
      generationConfig: {
        temperature: 0.4,
        topP: 0.95,
        maxOutputTokens: 4096,
      },
    });
  }

  /**
   * Analyze failures and determine recovery strategy
   */
  async recover(input: RecoveryInput): Promise<RecoveryOutput> {
    logger.info(`[${this.name}] Analyzing failures for task ${input.taskId}`, {
      failureCount: input.failures.length,
      maxIterationsReached: input.maxIterationsReached,
    });

    try {
      // Step 1: AI analyzes the failures
      const analysis = await this.analyzeFailures(input);

      logger.info(`[${this.name}] Failure analysis complete`, {
        rootCause: analysis.rootCause,
        category: analysis.category,
        severity: analysis.severity,
        canAutoRecover: analysis.canAutoRecover,
      });

      // Step 2: Determine recovery strategy
      const strategy = await this.determineStrategy(input, analysis);

      logger.info(`[${this.name}] Recovery strategy determined`, {
        action: strategy.action,
        reason: strategy.reason,
      });

      // Step 3: Execute recovery action
      await this.executeRecoveryAction(input, strategy, analysis);

      return {
        success: true,
        strategy,
        analysis,
        nextAction: this.formatNextAction(strategy),
      };
    } catch (error) {
      logger.error(`[${this.name}] Recovery analysis failed`, toError(error));

      // Fallback: Escalate to human
      return {
        success: false,
        strategy: {
          action: "human_review",
          reason: "Error recovery system failed, human review required",
        },
        analysis: {
          rootCause: "Recovery system error",
          category: "unknown",
          severity: "critical",
          suggestions: ["Manual review required"],
          canAutoRecover: false,
          requiresHuman: true,
          simplificationNeeded: false,
        },
        nextAction: "Task escalated to human review",
      };
    }
  }

  /**
   * AI analyzes the failures to understand root cause
   */
  private async analyzeFailures(input: RecoveryInput): Promise<ErrorAnalysis> {
    const prompt = this.buildAnalysisPrompt(input);

    const result = await this.model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse AI response
    try {
      const cleaned = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);

      return {
        rootCause: parsed.rootCause || "Unknown error",
        category: parsed.category || "unknown",
        severity: parsed.severity || "high",
        suggestions: parsed.suggestions || [],
        canAutoRecover: parsed.canAutoRecover ?? false,
        requiresHuman: parsed.requiresHuman ?? true,
        simplificationNeeded: parsed.simplificationNeeded ?? false,
      };
    } catch (error) {
      logger.error(`[${this.name}] Failed to parse AI analysis`, toError(error));

      // Fallback analysis
      return {
        rootCause: "Failed to parse AI analysis",
        category: "unknown",
        severity: "high",
        suggestions: ["Review errors manually"],
        canAutoRecover: false,
        requiresHuman: true,
        simplificationNeeded: false,
      };
    }
  }

  /**
   * Build prompt for AI analysis
   */
  private buildAnalysisPrompt(input: RecoveryInput): string {
    const { originalTask, failures } = input;

    return `
You are an expert error analyst. Analyze these task execution failures and determine the root cause.

**Original Task:**
- Title: ${originalTask.title}
- Description: ${originalTask.description}
- Estimated Lines: ${originalTask.estimatedLines}
- Complexity: ${originalTask.complexity}

**Failures (${failures.length} attempts):**
${failures
  .map(
    (f, i) => `
Attempt ${f.iteration}:
- Error: ${f.error}
- Stdout: ${f.stdout?.substring(0, 500) || "N/A"}
- Stderr: ${f.stderr?.substring(0, 500) || "N/A"}
- Files Attempted: ${f.filesAttempted?.join(", ") || "N/A"}
`
  )
  .join("\n")}

**Analysis Task:**
Analyze the failures and respond with ONLY valid JSON:

\`\`\`json
{
  "rootCause": "Primary reason for failure",
  "category": "syntax | logic | dependency | environment | complexity | unknown",
  "severity": "low | medium | high | critical",
  "suggestions": ["Specific suggestion 1", "Specific suggestion 2"],
  "canAutoRecover": true | false,
  "requiresHuman": true | false,
  "simplificationNeeded": true | false
}
\`\`\`

**Categories:**
- syntax: Code syntax errors, typos
- logic: Logical errors, wrong approach
- dependency: Missing packages, version conflicts
- environment: Sandbox issues, permissions
- complexity: Task too complex, needs splitting
- unknown: Cannot determine cause

**Guidelines:**
- canAutoRecover: true if agent can fix with retry/simplification
- requiresHuman: true if needs human expertise
- simplificationNeeded: true if task should be split into smaller pieces
    `.trim();
  }

  /**
   * Determine recovery strategy based on analysis
   */
  private async determineStrategy(
    input: RecoveryInput,
    analysis: ErrorAnalysis
  ): Promise<RecoveryStrategy> {
    // Critical errors always escalate
    if (analysis.severity === "critical" || analysis.requiresHuman) {
      return {
        action: "human_review",
        reason: `Critical failure: ${analysis.rootCause}. Human expertise required.`,
      };
    }

    // Task too complex - split it
    if (analysis.simplificationNeeded || analysis.category === "complexity") {
      return {
        action: "split",
        reason: `Task is too complex: ${analysis.rootCause}. Splitting into smaller tasks.`,
        modifications: {
          splitTasks: await this.generateSplitTasks(input),
        },
      };
    }

    // Dependency issues - can potentially auto-recover
    if (analysis.category === "dependency" && analysis.canAutoRecover) {
      return {
        action: "retry",
        reason: `Dependency issue detected: ${analysis.rootCause}. Retrying with fixes.`,
      };
    }

    // Syntax/logic errors - simplify prompt
    if (
      (analysis.category === "syntax" || analysis.category === "logic") &&
      analysis.canAutoRecover
    ) {
      return {
        action: "simplify",
        reason: `${analysis.category} error: ${analysis.rootCause}. Simplifying approach.`,
        modifications: {
          simplifiedPrompt: await this.generateSimplifiedPrompt(
            input,
            analysis
          ),
        },
      };
    }

    // Default: Escalate to human
    return {
      action: "human_review",
      reason: `Unable to auto-recover from: ${analysis.rootCause}`,
    };
  }

  /**
   * Execute the recovery action
   */
  private async executeRecoveryAction(
    input: RecoveryInput,
    strategy: RecoveryStrategy,
    analysis: ErrorAnalysis
  ): Promise<void> {
    const { taskId, projectId } = input;

    switch (strategy.action) {
      case "human_review":
      case "escalate":
        // Mark task for human review
        await prisma.agentTask.update({
          where: { id: taskId },
          data: {
            status: "needs_review",
            error: `${analysis.rootCause}\n\nAnalysis: ${JSON.stringify(analysis, null, 2)}\n\nStrategy: ${strategy.reason}`,
          },
        });

        // TODO: Send notification to user
        logger.warn(`[${this.name}] Task ${taskId} escalated to human review`);
        break;

      case "split":
        // Create new simplified tasks
        if (strategy.modifications?.splitTasks) {
          await this.createSplitTasks(
            projectId,
            taskId,
            strategy.modifications.splitTasks
          );
        }

        // Mark original task as superseded
        await prisma.agentTask.update({
          where: { id: taskId },
          data: {
            status: "superseded",
            error: `Task split into ${strategy.modifications?.splitTasks?.length || 0} smaller tasks`,
          },
        });
        break;

      case "simplify":
      case "retry":
        // Mark task as ready for retry
        await prisma.agentTask.update({
          where: { id: taskId },
          data: {
            status: "pending",
            retryCount: 0, // Reset retry count
            error: null,
            // Store simplified prompt if available
            input: strategy.modifications?.simplifiedPrompt
              ? ({
                  ...input.originalTask,
                  _recoveryPrompt: strategy.modifications.simplifiedPrompt,
                } as any)
              : (input.originalTask as any),
          },
        });
        break;
    }
  }

  /**
   * Generate split tasks from failed task
   */
  private async generateSplitTasks(input: RecoveryInput): Promise<
    Array<{
      title: string;
      description: string;
      estimatedLines: number;
    }>
  > {
    // TODO: Use AI to intelligently split the task
    // For now, return placeholder
    logger.warn(`[${this.name}] Task splitting not fully implemented yet`);
    return [];
  }

  /**
   * Generate simplified prompt
   */
  private async generateSimplifiedPrompt(
    input: RecoveryInput,
    analysis: ErrorAnalysis
  ): Promise<string> {
    // TODO: Use AI to generate a simpler approach
    logger.warn(
      `[${this.name}] Prompt simplification not fully implemented yet`
    );
    return "";
  }

  /**
   * Create split tasks in database
   */
  private async createSplitTasks(
    projectId: string,
    originalTaskId: string,
    splitTasks: Array<{
      title: string;
      description: string;
      estimatedLines: number;
    }>
  ): Promise<void> {
    for (const task of splitTasks) {
      await prisma.agentTask.create({
        data: {
          projectId,
          agentName: "BackendAgent", // TODO: Determine from original task
          status: "pending",
          priority: 1,
          input: {
            title: task.title,
            description: task.description,
            estimatedLines: task.estimatedLines,
            complexity: "simple",
            _splitFrom: originalTaskId,
          } as any,
        },
      });
    }

    logger.info(`[${this.name}] Created ${splitTasks.length} split tasks`);
  }

  /**
   * Format next action message
   */
  private formatNextAction(strategy: RecoveryStrategy): string {
    switch (strategy.action) {
      case "retry":
        return "Task will be retried with fixes";
      case "simplify":
        return "Task will be simplified and retried";
      case "split":
        return "Task has been split into smaller tasks";
      case "human_review":
      case "escalate":
        return "Task escalated for human review";
      default:
        return "Unknown action";
    }
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const errorRecoverySystem = new ErrorRecoverySystem();
