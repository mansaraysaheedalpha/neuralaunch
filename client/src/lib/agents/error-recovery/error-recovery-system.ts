// src/lib/agents/error-recovery/error-recovery-system.ts
/**
 * Error Recovery System
 * Handles task failures intelligently with AI analysis and human escalation
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { AI_MODELS } from "@/lib/models";
import { toError } from "@/lib/error-utils";
import { sendNotification } from "@/lib/notifications/notification-service";
import { env } from "@/lib/env";

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
  originalTask: {
    title: string;
    description: string;
    estimatedLines: number;
    complexity: string;
    [key: string]: unknown;
  };
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
  private model: GenerativeModel;
  private readonly name = "ErrorRecoverySystem";

  constructor() {
    const apiKey = env.GOOGLE_API_KEY;
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
      const parsed = JSON.parse(cleaned) as Partial<ErrorAnalysis>;

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
    (f, _) => `
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
        const task = await prisma.agentTask.update({
          where: { id: taskId },
          data: {
            status: "needs_review",
            error: `${analysis.rootCause}\n\nAnalysis: ${JSON.stringify(analysis, null, 2)}\n\nStrategy: ${strategy.reason}`,
          },
        });

        // Get project context to find userId
        const projectContext = await prisma.projectContext.findUnique({
          where: { projectId },
          select: { userId: true },
        });

        // Send escalation notification to user
        if (projectContext?.userId) {
          try {
            await sendNotification({
              userId: projectContext.userId,
              projectId,
              type: "escalation",
              priority: "critical",
              title: "Task Escalated",
              message: `Task ${taskId} requires human review`,
              escalationReason: analysis.rootCause,
              attempts: input.failures.length,
            });
            logger.info(`[${this.name}] Escalation notification sent for task ${taskId}`);
          } catch (notifError) {
            logger.error(`[${this.name}] Failed to send escalation notification`, toError(notifError));
          }

          // Create CriticalFailure record for UI tracking
          try {
            await prisma.criticalFailure.create({
              data: {
                projectId,
                userId: projectContext.userId,
                taskId,
                phase: "task-execution",
                component: task.agentName,
                title: `Task Escalated: ${input.originalTask?.title || taskId}`,
                description: `${analysis.rootCause}`,
                errorMessage: input.failures[input.failures.length - 1]?.error || "Unknown error",
                rootCause: analysis.rootCause,
                severity: "critical",
                issuesFound: input.failures.map((f) => ({
                  iteration: f.iteration,
                  error: f.error,
                  timestamp: f.timestamp,
                })),
                issuesRemaining: [
                  {
                    category: analysis.category,
                    rootCause: analysis.rootCause,
                    recommendation: strategy.reason,
                  },
                ],
                totalAttempts: input.failures.length,
                lastAttemptAt: new Date(),
                attemptHistory: input.failures.map((f) => ({
                  attempt: f.iteration,
                  timestamp: f.timestamp,
                  error: f.error,
                  files: f.filesAttempted,
                })),
                status: "open",
                escalatedToHuman: true,
                escalatedAt: new Date(),
                notificationSent: true,
                notificationSentAt: new Date(),
                stackTrace: input.failures[input.failures.length - 1]?.stderr,
                context: {
                  taskTitle: input.originalTask?.title,
                  taskDescription: input.originalTask?.description,
                  agentName: task.agentName,
                  analysisCategory: analysis.category,
                  recoveryStrategy: strategy.action,
                },
              },
            });
            logger.info(`[${this.name}] CriticalFailure record created for task ${taskId}`);
          } catch (dbError) {
            logger.error(`[${this.name}] Failed to create CriticalFailure record`, toError(dbError));
          }
        }

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
              ? JSON.stringify({
                  ...input.originalTask,
                  _recoveryPrompt: strategy.modifications.simplifiedPrompt,
                })
              : JSON.stringify(input.originalTask),
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
    try {
      logger.info(`[${this.name}] Generating split tasks for ${input.taskId}`);

      const taskDetails = input.originalTask;
      const failures = input.failures;

      // Build failure context
      const failureContext = failures
        .map(
          (f, i) =>
            `Attempt ${i + 1}: ${f.error}\nFiles: ${f.filesAttempted?.join(", ") || "N/A"}`
        )
        .join("\n\n");

      const prompt = `You are a task decomposition expert. A complex task has failed multiple times and needs to be split into smaller, manageable subtasks.

**Original Task:**
Title: ${taskDetails.title || "Unnamed Task"}
Description: ${taskDetails.description || "No description"}
Estimated Complexity: ${taskDetails.complexity || "unknown"}
Estimated Lines: ${taskDetails.estimatedLines || "unknown"}

**Failure History:**
${failureContext}

**Your Goal:**
Split this task into 2-4 smaller, independent subtasks that:
1. Can be executed separately
2. Are simpler and more focused
3. Build toward the original goal
4. Avoid the issues that caused the failures

**Output Format (JSON only, no markdown):**
{
  "subtasks": [
    {
      "title": "Concise task title",
      "description": "Detailed description of what this subtask should accomplish",
      "estimatedLines": 50,
      "rationale": "Why this is a separate task and how it avoids previous failures"
    }
  ],
  "splitStrategy": "Explanation of how you split the task"
}

Generate 2-4 subtasks that together achieve the original goal.`;

      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      // Parse JSON response (remove markdown code blocks if present)
      let jsonText = response.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/```\n?/g, "");
      }

      const parsed = JSON.parse(jsonText) as { subtasks: Array<{ title: string; description: string; estimatedLines: number; rationale?: string }>; splitStrategy?: string };

      if (!parsed.subtasks || !Array.isArray(parsed.subtasks)) {
        throw new Error("Invalid response format: missing subtasks array");
      }

      const subtasks = parsed.subtasks.map((task: { title: string; description: string; estimatedLines?: number }) => ({
        title: task.title,
        description: task.description,
        estimatedLines: task.estimatedLines || 50,
      }));

      logger.info(`[${this.name}] Generated ${subtasks.length} subtasks`, {
        strategy: parsed.splitStrategy,
      });

      return subtasks;
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate split tasks`, toError(error));

      // Fallback: Simple split based on task type
      return this.generateFallbackSplitTasks(input);
    }
  }

  /**
   * Fallback task splitting when AI fails
   */
  private generateFallbackSplitTasks(input: RecoveryInput): Array<{
    title: string;
    description: string;
    estimatedLines: number;
  }> {
    const taskDetails = input.originalTask;
    const originalTitle = taskDetails.title || "Task";

    // Generic split into setup, implementation, validation
    return [
      {
        title: `${originalTitle} - Setup & Dependencies`,
        description: "Set up required dependencies, imports, and basic structure",
        estimatedLines: Math.floor((taskDetails.estimatedLines || 100) * 0.3),
      },
      {
        title: `${originalTitle} - Core Implementation`,
        description: "Implement the main functionality",
        estimatedLines: Math.floor((taskDetails.estimatedLines || 100) * 0.5),
      },
      {
        title: `${originalTitle} - Testing & Validation`,
        description: "Add tests and validate the implementation",
        estimatedLines: Math.floor((taskDetails.estimatedLines || 100) * 0.2),
      },
    ];
  }

  /**
   * Generate simplified prompt
   */
  private async generateSimplifiedPrompt(
    input: RecoveryInput,
    analysis: ErrorAnalysis
  ): Promise<string> {
    try {
      logger.info(`[${this.name}] Generating simplified prompt for ${input.taskId}`);

      const taskDetails = input.originalTask;
      const failures = input.failures;

      // Build failure summary
      const failureSummary = failures
        .map((f, i) => `- Attempt ${i + 1}: ${f.error.slice(0, 200)}`)
        .join("\n");

      const prompt = `You are a prompt simplification expert. A task has failed repeatedly and needs to be simplified to a more achievable version.

**Original Task:**
Title: ${taskDetails.title || "Unnamed Task"}
Description: ${taskDetails.description || "No description"}
Complexity: ${taskDetails.complexity || "unknown"}

**Error Analysis:**
Root Cause: ${analysis.rootCause}
Category: ${analysis.category}
Severity: ${analysis.severity}

**Failure Summary:**
${failureSummary}

**AI Suggestions:**
${analysis.suggestions.join("\n")}

**Your Goal:**
Create a simplified version of this task that:
1. Focuses on the core functionality only
2. Removes edge cases and advanced features
3. Uses simpler approaches where possible
4. Explicitly avoids the patterns that caused failures
5. Can be accomplished with basic, proven techniques

**Output Format (Plain Text - No JSON):**
Provide ONLY the simplified task description that can be used as a prompt for an AI agent. Be specific, clear, and focus on simplicity. Include:
- What to build (simplified version)
- What NOT to include (features to skip)
- Specific approaches to use (based on what failed)
- Any constraints or simplifications

Keep it under 500 words.`;

      const result = await this.model.generateContent(prompt);
      const response = result.response.text().trim();

      if (!response || response.length < 50) {
        throw new Error("Generated prompt too short or empty");
      }

      logger.info(`[${this.name}] Generated simplified prompt (${response.length} chars)`);

      return response;
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate simplified prompt`, toError(error));

      // Fallback: Generic simplification
      return this.generateFallbackSimplifiedPrompt(input, analysis);
    }
  }

  /**
   * Fallback simplified prompt when AI fails
   */
  private generateFallbackSimplifiedPrompt(
    input: RecoveryInput,
    analysis: ErrorAnalysis
  ): string {
    const taskDetails = input.originalTask;

    return `SIMPLIFIED VERSION: ${taskDetails.title || "Task"}

Build a basic, minimal implementation focusing only on core functionality.

Requirements:
- Use simple, straightforward approaches
- Avoid complex patterns or advanced features
- Focus on getting a working MVP
- Skip edge cases and optimizations
- Use well-tested, standard libraries

Avoid:
- ${analysis.rootCause}
- Complex error handling
- Performance optimizations
- Advanced language features

Implementation:
${taskDetails.description || "Complete the task using the simplest possible approach."}

Success criteria: Basic functionality works without errors.`;
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
    // Define the input type for agentTask
    interface AgentTaskInput {
      title: string;
      description: string;
      estimatedLines: number;
      complexity: string;
      _splitFrom: string;
    }

    // Fetch the original task to determine the agent name
    const originalTask = await prisma.agentTask.findUnique({
      where: { id: originalTaskId },
      select: { agentName: true, priority: true },
    });

    if (!originalTask) {
      logger.error(`[${this.name}] Original task ${originalTaskId} not found for split tasks`);
      throw new Error(`Original task ${originalTaskId} not found`);
    }

    const agentName = originalTask.agentName;
    const priority = originalTask.priority ?? 1;

    for (const task of splitTasks) {
      const agentTaskInput: AgentTaskInput = {
        title: task.title,
        description: task.description,
        estimatedLines: task.estimatedLines,
        complexity: "simple",
        _splitFrom: originalTaskId,
      };

      await prisma.agentTask.create({
        data: {
          projectId,
          agentName,
          status: "pending",
          priority,
          input: JSON.stringify(agentTaskInput),
        },
      });
    }

    logger.info(`[${this.name}] Created ${splitTasks.length} split tasks with agent ${agentName}`);
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
