// src/lib/agents/base/base-agent.ts - COMPLETE VERSION WITH ANTHROPIC SUPPORT
/**
 * Base Agent Class - WORLD-CLASS COMPLETE
 *
 * ✅ SUPPORTS BOTH GOOGLE GEMINI AND ANTHROPIC CLAUDE
 * ✅ Web Search Tool - Search for documentation and solutions
 * ✅ Vector Memory - Semantic learning from past tasks
 * ✅ Code Analysis - Parse, type check, lint code
 * ✅ Context Loader - Smart project structure loading
 * ✅ Error Recovery - Auto-fix with web search
 *
 */

import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AI_MODELS } from "@/lib/models";
import { toolRegistry } from "../tools/base-tool";
import type { ITool, ToolContext, ToolResult } from "../tools/base-tool";
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
import { toError, toLogContext } from "@/lib/error-utils";

// Import tools to ensure they're registered before agents try to use them
import { initializeTools } from "../tools/index";
import { env } from "@/lib/env";
import type {
  TechStack,
  ProjectContext,
  AgentOutputData,
  SearchResult,
  CodeError,
} from "../types/common";

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
    [key: string]: unknown;
  };
  context: ProjectContext;
}

export interface AgentExecutionOutput {
  success: boolean;
  message: string;
  iterations: number;
  durationMs: number;
  data?: AgentOutputData;
  error?: string;
  retryDecision?: RetryDecision;
}

export abstract class BaseAgent {
  protected googleAI: GoogleGenAI | null = null;
  protected anthropic: Anthropic | null = null;
  protected config: BaseAgentConfig;
  protected selectedModel: string;

  protected tools: Map<string, ITool> = new Map();
  protected retryConfig: RetryConfig | null = null;
  protected failures: FailureAttempt[] = [];

  // Getter for agent name (for convenience)
  protected get name(): string {
    return this.config.name;
  }

  constructor(config: BaseAgentConfig) {
    this.config = config;

    // Ensure tools are initialized before loading them
    initializeTools();

    this.selectedModel = config.modelName || AI_MODELS.FAST;

    // ✅ NEW: Initialize appropriate SDK based on model
    if (this.selectedModel.includes("claude")) {
      // Use Anthropic SDK for Claude models
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          `ANTHROPIC_API_KEY required for ${config.name} using ${this.selectedModel}`
        );
      }
      this.anthropic = new Anthropic({ apiKey });
      logger.info(
        `[${config.name}] Initialized with Anthropic Claude: ${this.selectedModel}`
      );
    } else {
      // Use Google SDK for Gemini models
      const apiKey = env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error(
          `GOOGLE_API_KEY required for ${config.name} using ${this.selectedModel}`
        );
      }
      this.googleAI = new GoogleGenAI({ apiKey });
      logger.info(
        `[${config.name}] Initialized with Google Gemini: ${this.selectedModel}`
      );
    }

    this.loadTools();

    logger.info(`[${config.name}] Ready with ${this.tools.size} tools`);
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
      model: this.selectedModel,
    });

    try {
      this.retryConfig = retryStrategy.getRetryConfig(
        taskDetails.complexity,
        taskDetails.estimatedLines,
        this.selectedModel
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

         const ABSOLUTE_MAX_ATTEMPTS = 3;
         if (iteration > ABSOLUTE_MAX_ATTEMPTS) {
           logger.error(
             `[${this.config.name}] ⛔ EMERGENCY STOP: ${ABSOLUTE_MAX_ATTEMPTS} attempts exceeded`
           );
           break; // Exit the loop
         }

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

          // 🔍 Detect AI/network errors
          const isAIError = errorMessage.includes("AI") ||
                           errorMessage.includes("API") ||
                           errorMessage.includes("network") ||
                           errorMessage.includes("timeout") ||
                           errorMessage.includes("ECONNREFUSED") ||
                           errorMessage.includes("ETIMEDOUT") ||
                           errorMessage.includes("rate limit") ||
                           errorMessage.includes("429");

          logger.error(
            `[${this.config.name}] Iteration ${iteration} failed`,
            toError(error),
            {
              isAIError,
              errorType: error instanceof Error ? error.constructor.name : typeof error,
            }
          );

          const totalDuration = Date.now() - startTime;
          const retryDecision = retryStrategy.shouldRetry(
            iteration,
            totalDuration,
            this.retryConfig
          );

          if (!retryDecision.shouldRetry) {
            logger.warn(`[${this.config.name}] Stopping retries: ${retryDecision.reason}`);
            break;
          }

          // ✅ EXPONENTIAL BACKOFF with jitter
          const baseDelay = 2000; // 2 seconds
          const exponentialDelay = baseDelay * Math.pow(2, iteration - 1); // 2s, 4s, 8s
          const jitter = Math.random() * 1000; // Random 0-1s
          const delayMs = Math.min(exponentialDelay + jitter, 30000); // Max 30s

          logger.info(
            `[${this.config.name}] Waiting ${Math.round(delayMs / 1000)}s before retry ${iteration + 1}...`,
            { isAIError, delayMs: Math.round(delayMs) }
          );

          await new Promise((resolve) => setTimeout(resolve, delayMs));
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
      logger.error(
        `[${this.config.name}] Execution framework error`,
        toError(error)
      );

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
        const data = contextResult.data as {
          existingFiles?: Record<string, string>;
          structure?: unknown;
          dependencies?: unknown;
          configuration?: unknown;
        };
        input.context._existingFiles = data.existingFiles || {};
        input.context._projectStructure = data.structure;
        input.context._dependencies = data.dependencies;
        input.context._configuration = data.configuration;

        logger.info(
          `[${this.config.name}] Loaded ${Object.keys(data.existingFiles || {}).length} files into context`
        );
      }
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to load project context`,
        toLogContext(error)
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

      if (searchResult.success && searchResult.data) {
        const results = searchResult.data as { results?: SearchResult[] };
        if (results.results && results.results.length > 0) {
          const solutions = results.results
            .map(
              (r: SearchResult, i: number) =>
                `${i + 1}. ${r.title}: ${r.description}`
            )
            .join("\n");

          input.context._errorSolution = `**Potential Solutions (from web search):**\n${solutions}`;

          logger.info(
            `[${this.config.name}] Found ${results.results.length} potential solutions`
          );
        }
      }
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Web search for solution failed`,
        toLogContext(error)
      );
    }
  }

  /**
   * ✅ NEW: Analyze error with code analysis
   */
  private async analyzeError(
    _output: AgentExecutionOutput,
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

      if (typeCheckResult.success && typeCheckResult.data) {
        const typeData = typeCheckResult.data as {
          hasErrors?: boolean;
          errors?: CodeError[];
        };
        if (typeData.hasErrors && typeData.errors) {
          const topErrors = typeData.errors
            .slice(0, 5)
            .map((e: CodeError) => `${e.file}(${e.line}): ${e.message}`)
            .join("\n");

          input.context._typeErrors = `**TypeScript Errors:**\n${topErrors}`;
        }
      }
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Code analysis failed`,
        toLogContext(error)
      );
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
          output.data?.filesCreated?.map((f) =>
            typeof f === "string" ? f : f.path
          ) || [],
        commandsRun:
          output.data?.commandsRun?.map((c) =>
            typeof c === "string" ? c : c.command
          ) || [],
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
        toLogContext(error)
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
      logger.warn(
        `[${this.config.name}] Failed to verify deployment`,
        toLogContext(error)
      );
    }
  }

  /**
   * Extract tech stack as string array
   */
  private extractTechStack(techStack: TechStack | undefined): string[] {
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
    params: Record<string, unknown>,
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

  /**
   * Parse and validate parameters for agent execution
   * Subclasses can override this for custom parameter parsing
   */
  protected parseParams<T = Record<string, unknown>>(
    params: Record<string, unknown>
  ): T {
    // Default implementation: basic type checking and validation
    if (!params || typeof params !== "object") {
      throw new Error("Invalid params: must be an object");
    }
    return params as T;
  }

  /**
   * ✅ NEW: Universal AI generation method that works with both Google and Anthropic
   * Subclasses can use this for consistent AI calls
   * @param prompt - The user prompt
   * @param systemInstruction - Optional system instruction
   * @param enableTools - Enable native tool use (agentic mode) - default true for Claude
   * @param toolContext - Context for tool execution (projectId, userId)
   */
  protected async generateContent(
    prompt: string,
    systemInstruction?: string,
    enableTools?: boolean,
    toolContext?: { projectId: string; userId: string }
  ): Promise<string> {
    try {
      // Default enableTools to true for Claude (agentic mode), false for Gemini
      const shouldEnableTools =
        enableTools ?? this.selectedModel.includes("claude");

      logger.info(`[${this.config.name}] Calling AI generation`, {
        model: this.selectedModel,
        provider: this.selectedModel.includes("claude")
          ? "Anthropic"
          : "Google",
        promptLength: prompt.length,
        hasSystemInstruction: !!systemInstruction,
        toolsEnabled: shouldEnableTools,
        availableTools: this.tools.size,
      });

      let text: string;

      if (this.selectedModel.includes("claude")) {
        // Use Anthropic SDK with optional tool use
        text = await this.generateWithClaude(
          prompt,
          systemInstruction,
          shouldEnableTools,
          toolContext
        );
      } else {
        // Use Google SDK
        text = await this.generateWithGemini(prompt, systemInstruction);
      }

      // ✅ ENHANCED: Detailed logging for debugging empty responses
      logger.info(`[${this.config.name}] AI response received`, {
        responseLength: text.length,
        isEmpty: !text,
        preview: text.substring(0, 200),
      });

      // ✅ DIAGNOSTIC: Log full details if response is empty
      if (!text || text.trim().length === 0) {
        logger.error(`[${this.config.name}] AI returned empty response - DIAGNOSTIC INFO`, undefined, {
          model: this.selectedModel,
          provider: this.selectedModel.includes("claude") ? "Anthropic" : "Google",
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 500),
          hasSystemInstruction: !!systemInstruction,
          systemInstructionLength: systemInstruction?.length || 0,
          responseReceived: !!text,
          responseLength: text?.length || 0,
          responseValue: text || "(null/undefined)",
          toolsEnabled: shouldEnableTools,
          availableToolsCount: this.tools.size,
        });
        throw new Error(
          `AI model failed to generate any output. This is likely a transient issue with the ${
            this.selectedModel.includes("claude") ? "Anthropic" : "Google"
          } API. Please retry.`
        );
      }

      return text;
    } catch (error) {
      logger.error(
        `[${this.config.name}] AI generation failed`,
        toError(error),
        {
          model: this.selectedModel,
          promptLength: prompt.length,
        }
      );
      throw error;
    }
  }

  /**
   * ✅ Generate content using Anthropic Claude with optional native tool use (agentic mode)
   */
  private async generateWithClaude(
    prompt: string,
    systemInstruction?: string,
    enableTools = false,
    toolContext?: { projectId: string; userId: string }
  ): Promise<string> {
    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized");
    }

    try {
      // Convert tools to Anthropic format if tools are enabled
      const tools = enableTools ? this.convertToolsToAnthropicFormat() : undefined;

      logger.info(`[${this.config.name}] Calling Claude`, {
        model: this.selectedModel,
        toolsEnabled: enableTools,
        toolsCount: tools?.length ?? 0,
      });

      // Initial message
      const messages: Anthropic.MessageParam[] = [
        {
          role: "user",
          content: prompt,
        },
      ];

      let finalResponse = "";
      let continueLoop = true;
      let iterationCount = 0;
      const MAX_ITERATIONS = 10; // Prevent infinite loops

      // Tool calling loop
      while (continueLoop && iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        // ✅ Add timeout wrapper to prevent hanging with retry logic
        const API_TIMEOUT_MS = 180000; // 3 minutes (increased for complex tasks)
        
        let response: Anthropic.Message | undefined;
        let apiCallAttempt = 0;
        const MAX_API_RETRIES = 2;
        
        while (apiCallAttempt <= MAX_API_RETRIES) {
          apiCallAttempt++;
          
          try {
            const responsePromise = this.anthropic.messages.create({
              model: this.selectedModel,
              max_tokens: 16384, // ✅ INCREASED: 16K tokens for large responses (database schemas, etc.)
              system: systemInstruction,
              messages,
              tools,
            });

            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`AI API call timed out after ${API_TIMEOUT_MS / 1000}s`)), API_TIMEOUT_MS)
            );

            response = await Promise.race([responsePromise, timeoutPromise]);
            break; // Success, exit retry loop
          } catch (apiError) {
            if (apiCallAttempt > MAX_API_RETRIES) {
              throw apiError; // Max retries reached, propagate error
            }
            
            // Check if it's a retryable error
            const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
            const isRetryable = errorMessage.includes("timeout") || 
                               errorMessage.includes("ECONNRESET") ||
                               errorMessage.includes("ETIMEDOUT") ||
                               errorMessage.includes("503") ||
                               errorMessage.includes("502");
            
            if (!isRetryable) {
              throw apiError; // Not retryable, propagate immediately
            }
            
            logger.warn(
              `[${this.config.name}] API call failed, retrying (${apiCallAttempt}/${MAX_API_RETRIES})`,
              toLogContext(apiError)
            );
            
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 2000 * apiCallAttempt));
          }
        }
        
        if (!response) {
          throw new Error("Failed to get response from API after retries");
        }

        logger.info(`[${this.config.name}] Claude iteration ${iterationCount}`, {
          stopReason: response.stop_reason,
          contentBlocks: response.content.length,
        });

        // ✅ SAFETY: Exit early if we're in a tool loop with no text output
        if (iterationCount > 1 && finalResponse.trim().length === 0) {
          logger.warn(
            `[${this.config.name}] Tool loop iteration ${iterationCount} with no text output yet - stopping early to prevent empty response`
          );
          break;
        }

        // Check for stop reasons
        if (response.stop_reason === "max_tokens") {
          logger.warn(
            `[${this.config.name}] Claude hit max_tokens limit, response may be truncated`
          );
        }

        // Process response content
        let hasToolUse = false;
        const toolResults: Anthropic.MessageParam[] = [];

        for (const block of response.content) {
          if (block.type === "text") {
            finalResponse += block.text + "\n";
          } else if (block.type === "tool_use" && enableTools && toolContext) {
            hasToolUse = true;
            // Execute the tool
            const toolResult = await this.executeClaudeTool(
              block.name,
              block.input as Record<string, unknown>,
              toolContext
            );

            // Add tool result to messages for next iteration
            toolResults.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(toolResult),
                },
              ],
            });

            logger.info(`[${this.config.name}] Tool executed: ${block.name}`, {
              success: toolResult.success,
            });
          }
        }

        // Add assistant response to messages
        messages.push({
          role: "assistant",
          content: response.content,
        });

        // If there were tool uses, add tool results and continue loop
        if (hasToolUse && toolResults.length > 0) {
          messages.push(...toolResults);
          continueLoop = true; // Continue to get Claude's response after tool use
        } else {
          // No more tool uses, we're done
          continueLoop = false;
        }

        // Also stop if Claude says it's done (stop_reason is end_turn)
        if (response.stop_reason === "end_turn") {
          continueLoop = false;
        }
      }

      if (iterationCount >= MAX_ITERATIONS) {
        logger.warn(
          `[${this.config.name}] Tool calling loop hit max iterations (${MAX_ITERATIONS})`
        );
      }

      return finalResponse.trim();
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        // Provide detailed error information
        const status = error.status as number | undefined;
        const errorDetails = {
          status,
          message: error.message,
          isRateLimit: status === 429,
          isServerError: status !== undefined && status >= 500,
          isNetworkError: status === undefined,
        };

        logger.error(`[${this.config.name}] Anthropic API Error`, undefined, errorDetails);

        // Enhance error message for better debugging
        if (status === 429) {
          throw new Error(`AI API rate limit exceeded. Please wait before retrying. (${error.message})`);
        } else if (status !== undefined && status >= 500) {
          throw new Error(`AI API server error (${status}). This is a temporary issue. (${error.message})`);
        } else if (status === undefined) {
          throw new Error(`AI API network error. Check your internet connection. (${error.message})`);
        }
      } else if (error instanceof Error) {
        // Handle other errors
        logger.error(`[${this.config.name}] Claude generation error`, error, {
          errorName: error.name,
          errorMessage: error.message,
        });
      }
      throw error;
    }
  }

  /**
   * Convert agent tools to Anthropic tool format
   */
  private convertToolsToAnthropicFormat(): Anthropic.Tool[] {
    const anthropicTools: Anthropic.Tool[] = [];

    for (const tool of this.tools.values()) {
      const metadata = tool.getMetadata();

      // Build input schema from parameters
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const param of metadata.parameters) {
        properties[param.name] = {
          type: this.mapToolParameterType(param.type),
          description: param.description,
        };

        if (param.required) {
          required.push(param.name);
        }
      }

      anthropicTools.push({
        name: metadata.name,
        description: metadata.description,
        input_schema: {
          type: "object",
          properties,
          required,
        },
      });
    }

    return anthropicTools;
  }

  /**
   * Map tool parameter types to JSON schema types
   */
  private mapToolParameterType(type: string): string {
    const typeMap: Record<string, string> = {
      string: "string",
      number: "number",
      boolean: "boolean",
      array: "array",
      object: "object",
    };
    return typeMap[type] || "string";
  }

  /**
   * Execute a tool called by Claude
   */
  private async executeClaudeTool(
    toolName: string,
    input: Record<string, unknown>,
    context: { projectId: string; userId: string }
  ): Promise<ToolResult> {
    try {
      logger.info(`[${this.config.name}] Executing tool: ${toolName}`, {
        input,
      });

      const result = await this.executeTool(toolName, input, context);

      return result;
    } catch (error) {
      logger.error(
        `[${this.config.name}] Tool execution failed: ${toolName}`,
        toError(error)
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * ✅ Generate content using Google Gemini
   */
  private async generateWithGemini(
    prompt: string,
    systemInstruction?: string
  ): Promise<string> {
    if (!this.googleAI) {
      throw new Error("Google AI client not initialized");
    }

    // ✅ Add retry logic for Gemini API calls
    let apiCallAttempt = 0;
    const MAX_API_RETRIES = 2;
    const API_TIMEOUT_MS = 180000; // 3 minutes
    
    while (apiCallAttempt <= MAX_API_RETRIES) {
      apiCallAttempt++;
      
      try {
        const responsePromise = this.googleAI.models.generateContent({
          model: this.selectedModel,
          contents: [{ parts: [{ text: prompt }] }],
          ...(systemInstruction && {
            systemInstruction: { parts: [{ text: systemInstruction }] },
          }),
          config: {
            temperature: 0.3,
            topP: 0.95,
            maxOutputTokens: 20000,
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini API call timed out after ${API_TIMEOUT_MS / 1000}s`)), API_TIMEOUT_MS)
        );

        const response = await Promise.race([responsePromise, timeoutPromise]);
        const text = response.text || "";

        // Check for safety blocks
        if (!text && response.candidates?.[0]?.finishReason) {
          logger.error(
            `[${this.config.name}] Gemini generation blocked`,
            undefined,
            {
              finishReason: response.candidates[0].finishReason,
              safetyRatings: response.candidates[0].safetyRatings,
            }
          );
          throw new Error(
            `AI generation blocked: ${response.candidates[0].finishReason}`
          );
        }

        return text;
      } catch (apiError) {
        if (apiCallAttempt > MAX_API_RETRIES) {
          throw apiError; // Max retries reached, propagate error
        }
        
        // Check if it's a retryable error
        const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
        const isRetryable = errorMessage.includes("timeout") || 
                           errorMessage.includes("ECONNRESET") ||
                           errorMessage.includes("ETIMEDOUT") ||
                           errorMessage.includes("503") ||
                           errorMessage.includes("502") ||
                           errorMessage.includes("429");
        
        if (!isRetryable && !errorMessage.includes("blocked")) {
          throw apiError; // Not retryable, propagate immediately
        }
        
        if (errorMessage.includes("blocked")) {
          throw apiError; // Safety blocks are not retryable
        }
        
        logger.warn(
          `[${this.config.name}] Gemini API call failed, retrying (${apiCallAttempt}/${MAX_API_RETRIES})`,
          { error: errorMessage }
        );
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 2000 * apiCallAttempt));
      }
    }
    
    // This should never be reached due to throw in the loop, but TypeScript needs it
    throw new Error("Gemini API call failed after all retries");
  }

  protected async logExecution(
    input: AgentExecutionInput,
    output: unknown,
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
          },
          output: output as Prisma.InputJsonValue,
          success,
          durationMs,
          error,
        },
      });
    } catch (logError) {
      logger.error(
        `[${this.config.name}] Failed to log execution`,
        toError(logError)
      );
    }
  }
}
