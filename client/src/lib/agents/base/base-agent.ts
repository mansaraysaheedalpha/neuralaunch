// src/lib/agents/base/base-agent.ts - COMPLETE VERSION (100/100)
/**
 * Base Agent Class - WORLD-CLASS COMPLETE
 *
 * ✅ Web Search Tool - Search for documentation and solutions
 * ✅ Vector Memory - Semantic learning from past tasks
 * ✅ Code Analysis - Parse, type check, lint code
 * ✅ Context Loader - Smart project structure loading
 * ✅ Error Recovery - Auto-fix with web search
 *
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { AI_MODELS } from "@/lib/models";
import { toolRegistry, ITool, ToolContext } from "../tools/base-tool";
import {
  retryStrategy,
  RetryConfig,
  RetryDecision,
} from "../retry/retry-strategy";
import { vectorMemory } from "../memory/vector-memory";
import {
  errorRecoverySystem,
  FailureAttempt,
} from "../error-recovery/error-recovery-system";

export interface BaseAgentConfig {
  name: string;
  category: "execution" | "quality" | "deployment";
  description: string;
  supportedTaskTypes: string[];
  requiredTools: string[];
  modelName?: string;
}

export interface AgentExecutionInput {
  taskId: string;
  projectId: string;
  userId: string;
  conversationId: string;
  taskDetails: {
    title: string;
    description: string;
    complexity: "simple" | "medium";
    estimatedLines: number;
    [key: string]: any;
  };
  context: {
    techStack: any;
    architecture: any;
    [key: string]: any;
  };
}

export interface AgentExecutionOutput {
  success: boolean;
  message: string;
  iterations: number;
  durationMs: number;
  data?: any;
  error?: string;
  retryDecision?: RetryDecision;
}

export abstract class BaseAgent {
  protected genAI: GoogleGenerativeAI;
  protected model: any;
  protected config: BaseAgentConfig;

  protected tools: Map<string, ITool> = new Map();
  protected retryConfig: RetryConfig | null = null;
  protected failures: FailureAttempt[] = [];

  // Getter for agent name (for convenience)
  protected get name(): string {
    return this.config.name;
  }

  constructor(config: BaseAgentConfig) {
    this.config = config;

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(`GOOGLE_API_KEY required for ${config.name}`);
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    const selectedModel = config.modelName || AI_MODELS.FAST;

    this.model = this.genAI.getGenerativeModel({
      model: selectedModel,
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    });

    this.loadTools();

    logger.info(
      `[${config.name}] Initialized with model: ${selectedModel}, ${this.tools.size} tools`
    );
  }

  private loadTools(): void {
    this.config.requiredTools.forEach((toolName) => {
      const tool = toolRegistry.get(toolName);
      if (tool) {
        this.tools.set(toolName, tool);
      } else {
        logger.warn(
          `[${this.config.name}] Required tool not found: ${toolName}`
        );
      }
    });
  }

  abstract executeTask(
    input: AgentExecutionInput
  ): Promise<AgentExecutionOutput>;

  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const startTime = Date.now();
    const { taskId, taskDetails } = input;

    logger.info(`[${this.config.name}] Starting execution`, {
      taskId,
      title: taskDetails.title,
      complexity: taskDetails.complexity,
    });

    try {
      this.retryConfig = retryStrategy.getRetryConfig(
        taskDetails.complexity,
        taskDetails.estimatedLines,
        this.config.modelName
      );

      logger.info(`[${this.config.name}] Retry strategy`, {
        maxIterations: this.retryConfig.maxIterations,
        maxCost: this.retryConfig.maxCostDollars,
      });

      // ✅ ENHANCEMENT 1: Load Project Context (if available)
      if (this.tools.has("context_loader")) {
        await this.loadProjectContext(input);
      }

      // ✅ ENHANCEMENT 2: Vector Memory - Semantic search for similar tasks
      const relevantContext = await vectorMemory.getRelevantContext(
        this.config.name,
        taskDetails.title + " " + taskDetails.description,
        this.extractTechStack(input.context.techStack)
      );

      if (relevantContext !== "No similar past tasks found.") {
        logger.info(
          `[${this.config.name}] Found relevant past experience (vector search)`
        );
        input.context._memoryContext = relevantContext;
      }

      let iteration = 0;
      let taskSuccess = false;
      let output: AgentExecutionOutput | null = null;
      this.failures = [];

      while (!taskSuccess && iteration < this.retryConfig.maxIterations) {
        iteration++;

        logger.info(
          `[${this.config.name}] Iteration ${iteration}/${this.retryConfig.maxIterations}`
        );

        try {
          output = await this.executeTask(input);

          if (output.success) {
            taskSuccess = true;
            logger.info(
              `[${this.config.name}] ✅ Task completed on iteration ${iteration}`
            );
          } else {
            // ✅ ENHANCEMENT 3: Search for solution before retry
            await this.searchForSolution(output, input, iteration);

            // ✅ ENHANCEMENT 4: Analyze error with code analysis (if available)
            if (this.tools.has("code_analysis")) {
              await this.analyzeError(output, input);
            }

            this.failures.push({
              iteration,
              error: output.error || "Unknown error",
              timestamp: new Date(),
            });

            const totalDuration = Date.now() - startTime;
            const retryDecision = retryStrategy.shouldRetry(
              iteration,
              totalDuration,
              this.retryConfig
            );

            if (!retryDecision.shouldRetry) {
              logger.warn(`[${this.config.name}] Retry limits exceeded`, {
                reason: retryDecision.reason,
              });
              break;
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

          this.failures.push({
            iteration,
            error: errorMessage,
            timestamp: new Date(),
          });

          logger.error(
            `[${this.config.name}] Iteration ${iteration} failed`,
            error
          );

          const totalDuration = Date.now() - startTime;
          const retryDecision = retryStrategy.shouldRetry(
            iteration,
            totalDuration,
            this.retryConfig
          );

          if (!retryDecision.shouldRetry) {
            break;
          }
        }
      }

      const totalDuration = Date.now() - startTime;

      if (taskSuccess && output) {
        // ✅ Store in Vector Memory
        await this.storeInVectorMemory(input, output, iteration, totalDuration);

        return {
          ...output,
          iterations: iteration,
          durationMs: totalDuration,
        };
      } else {
        logger.warn(
          `[${this.config.name}] Task failed after ${iteration} iterations`
        );

        // Store failure in Vector Memory
        await this.storeInVectorMemory(
          input,
          output || {
            success: false,
            message: "Failed",
            iterations: iteration,
            durationMs: totalDuration,
          },
          iteration,
          totalDuration
        );

        const recovery = await errorRecoverySystem.recover({
          taskId,
          projectId: input.projectId,
          userId: input.userId,
          conversationId: input.conversationId,
          originalTask: taskDetails,
          failures: this.failures,
          maxIterationsReached: iteration >= this.retryConfig.maxIterations,
        });

        return {
          success: false,
          message: `Task failed: ${recovery.analysis.rootCause}. ${recovery.nextAction}`,
          iterations: iteration,
          durationMs: totalDuration,
          error: recovery.analysis.rootCause,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.config.name}] Execution framework error`, error);

      return {
        success: false,
        message: `Framework error: ${errorMessage}`,
        iterations: 0,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * ✅ NEW: Load project context intelligently
   */
  private async loadProjectContext(input: AgentExecutionInput): Promise<void> {
    try {
      logger.info(`[${this.config.name}] Loading project context`);

      const contextResult = await this.executeTool(
        "context_loader",
        {
          operation: "smart_load",
          taskDescription:
            input.taskDetails.title + " " + input.taskDetails.description,
          maxFiles: 15,
          maxSize: 300000, // 300KB limit
        },
        {
          projectId: input.projectId,
          userId: input.userId,
        }
      );

      if (contextResult.success && contextResult.data) {
        // Add loaded files to context
        input.context._existingFiles = contextResult.data.existingFiles || {};
        input.context._projectStructure = contextResult.data.structure;
        input.context._dependencies = contextResult.data.dependencies;
        input.context._configuration = contextResult.data.configuration;

        logger.info(
          `[${this.config.name}] Loaded ${Object.keys(contextResult.data.existingFiles || {}).length} files into context`
        );
      }
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to load project context`,
        error
      );
    }
  }

  /**
   * ✅ NEW: Search for solution when error occurs
   */
  private async searchForSolution(
    output: AgentExecutionOutput,
    input: AgentExecutionInput,
    iteration: number
  ): Promise<void> {
    if (!this.tools.has("web_search") || !output.error) {
      return;
    }

    try {
      logger.info(`[${this.config.name}] Searching for solution to error`, {
        error: output.error.substring(0, 100),
        iteration,
      });

      const searchQuery = `${output.error} ${input.context.techStack?.frontend?.framework || ""} ${input.context.techStack?.backend?.framework || ""} solution`;

      const searchResult = await this.executeTool(
        "web_search",
        {
          query: searchQuery,
          maxResults: 3,
        },
        {
          projectId: input.projectId,
          userId: input.userId,
        }
      );

      if (searchResult.success && searchResult.data?.results?.length > 0) {
        const solutions = searchResult.data.results
          .map((r: any, i: number) => `${i + 1}. ${r.title}: ${r.description}`)
          .join("\n");

        input.context._errorSolution = `**Potential Solutions (from web search):**\n${solutions}`;

        logger.info(
          `[${this.config.name}] Found ${searchResult.data.results.length} potential solutions`
        );
      }
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Web search for solution failed`,
        error
      );
    }
  }

  /**
   * ✅ NEW: Analyze error with code analysis
   */
  private async analyzeError(
    output: AgentExecutionOutput,
    input: AgentExecutionInput
  ): Promise<void> {
    try {
      logger.info(`[${this.config.name}] Analyzing error with code analysis`);

      // Check types if TypeScript
      const typeCheckResult = await this.executeTool(
        "code_analysis",
        {
          operation: "check_types",
          language: "typescript",
        },
        {
          projectId: input.projectId,
          userId: input.userId,
        }
      );

      if (typeCheckResult.success && typeCheckResult.data?.hasErrors) {
        const topErrors = typeCheckResult.data.errors
          .slice(0, 5)
          .map((e: any) => `${e.file}(${e.line}): ${e.message}`)
          .join("\n");

        input.context._typeErrors = `**TypeScript Errors:**\n${topErrors}`;
      }
    } catch (error) {
      logger.warn(`[${this.config.name}] Code analysis failed`, error);
    }
  }

  /**
   * ✅ Store execution in Vector Memory
   */
  private async storeInVectorMemory(
    input: AgentExecutionInput,
    output: AgentExecutionOutput,
    iterations: number,
    durationMs: number
  ): Promise<void> {
    try {
      const learnings: string[] = [];

      if (output.success) {
        learnings.push(`Completed in ${iterations} iteration(s)`);
        learnings.push(`Took ${Math.round(durationMs / 1000)}s`);

        if (output.data?.explanation) {
          learnings.push(output.data.explanation);
        }

        // 🔥 NEW: If deployment URL exists, verify it's live
        if (
          output.data?.deploymentUrl &&
          this.tools.has("browser_automation")
        ) {
          await this.verifyDeployment(output.data.deploymentUrl, input);
        }
      } else {
        learnings.push(`Failed after ${iterations} iterations`);
        if (output.error) {
          learnings.push(`Error: ${output.error}`);
        }
      }

      await vectorMemory.store({
        agentName: this.config.name,
        taskType: this.config.category,
        taskTitle: input.taskDetails.title,
        taskDescription: input.taskDetails.description,
        techStack: this.extractTechStack(input.context.techStack),
        complexity: input.taskDetails.complexity,
        estimatedLines: input.taskDetails.estimatedLines,
        success: output.success,
        iterations,
        durationMs,
        error: output.error,
        filesCreated:
          output.data?.filesCreated?.map((f: any) => f.path || f) || [],
        commandsRun:
          output.data?.commandsRun?.map((c: any) => c.command || c) || [],
        learnings,
        errorsSolved:
          this.failures.length > 0 && output.success
            ? [this.failures[this.failures.length - 1].error]
            : [],
        projectId: input.projectId,
        userId: input.userId,
      });

      logger.info(`[${this.config.name}] Stored execution in vector memory`);
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to store in vector memory`,
        error
      );
    }
  }

  /**
   * 🔥 NEW: Verify deployment with browser automation
   */
  private async verifyDeployment(
    deploymentUrl: string,
    input: AgentExecutionInput
  ): Promise<void> {
    try {
      logger.info(
        `[${this.config.name}] Verifying deployment at ${deploymentUrl}`
      );

      const verifyResult = await this.executeTool(
        "browser_automation",
        {
          operation: "verify_deployment",
          url: deploymentUrl,
          timeout: 30000,
        },
        {
          projectId: input.projectId,
          userId: input.userId,
        }
      );

      if (verifyResult.success) {
        logger.info(
          `[${this.config.name}] ✅ Deployment verified: ${deploymentUrl}`
        );
      } else {
        logger.warn(
          `[${this.config.name}] ⚠️ Deployment verification failed: ${verifyResult.error}`
        );
      }
    } catch (error) {
      logger.warn(`[${this.config.name}] Failed to verify deployment`, error);
    }
  }

  /**
   * Extract tech stack as string array
   */
  private extractTechStack(techStack: any): string[] {
    const stack: string[] = [];

    if (!techStack) return stack;

    if (techStack.language) stack.push(techStack.language);
    if (techStack.frontend?.framework) stack.push(techStack.frontend.framework);
    if (techStack.backend?.framework) stack.push(techStack.backend.framework);
    if (techStack.database?.type) stack.push(techStack.database.type);
    if (techStack.styling) stack.push(techStack.styling);

    return stack;
  }

  protected async executeTool(
    toolName: string,
    params: Record<string, any>,
    context: ToolContext
  ) {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(
        `Tool '${toolName}' not available to ${this.config.name}`
      );
    }

    return await tool.execute(params, context);
  }

  protected getToolsDescription(): string {
    const tools = Array.from(this.tools.values());

    return tools
      .map((tool) => {
        const meta = tool.getMetadata();
        return `**${meta.name}**: ${meta.description}`;
      })
      .join("\n");
  }

  protected async logExecution(
    input: AgentExecutionInput,
    output: any,
    success: boolean,
    durationMs: number,
    error?: string
  ): Promise<void> {
    try {
      await prisma.agentExecution.create({
        data: {
          projectId: input.projectId,
          agentName: this.config.name,
          phase: this.config.category,
          input: {
            taskId: input.taskId,
            title: input.taskDetails.title,
          } as any,
          output: output as any,
          success,
          durationMs,
          error,
        },
      });
    } catch (logError) {
      logger.error(`[${this.config.name}] Failed to log execution`, logError);
    }
  }
}
