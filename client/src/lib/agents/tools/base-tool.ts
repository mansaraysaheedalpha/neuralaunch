// src/lib/agents/tools/base-tool.ts
/**
 * Base Tool Interface
 * All agent tools implement this interface
 * Inspired by LangChain but optimized for our use case
 */

import { logger } from "@/lib/logger";

// ==========================================
// BASE TYPES
// ==========================================

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration?: number;
  metadata?: {
    executionTime?: number;
    tokensUsed?: number;
    [key: string]: unknown;
  };
}

export interface ToolContext {
  projectId: string;
  userId: string;
  conversationId?: string;
  maxRetries?: number;
  timeout?: number;
}

// ==========================================
// BASE TOOL INTERFACE
// ==========================================

export interface ITool {
  name: string;
  description: string;
  parameters: ToolParameter[];

  /**
   * Execute the tool with given parameters
   */
  execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult>;

  /**
   * Validate parameters before execution
   */
  validate(params: Record<string, unknown>): { valid: boolean; errors: string[] };

  /**
   * Get tool metadata for AI prompt
   */
  getMetadata(): {
    name: string;
    description: string;
    parameters: ToolParameter[];
    examples?: string[];
  };
}

// ==========================================
// ABSTRACT BASE TOOL CLASS
// ==========================================

export abstract class BaseTool implements ITool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameter[];

  protected logPrefix: string;

  constructor() {
    this.logPrefix = `[Tool:${this.constructor.name}]`;
  }

  /**
   * Execute the tool (must be implemented by subclass)
   */
  abstract execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult>;

  /**
   * Validate parameters
   */
  validate(params: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const param of this.parameters) {
      // Check required parameters
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      // Check parameter types
      if (param.name in params) {
        const value = params[param.name];
        const actualType = Array.isArray(value) ? "array" : typeof value;

        if (actualType !== param.type && value !== undefined) {
          errors.push(
            `Parameter ${param.name} must be ${param.type}, got ${actualType}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get tool metadata for AI prompt
   */
  getMetadata() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      examples: this.getExamples(),
    };
  }

  /**
   * Get usage examples (override in subclass)
   */
  protected getExamples(): string[] {
    return [];
  }

  /**
   * Protected helper: Log execution
   */
  protected logExecution(action: string, data?: unknown): void {
    logger.info(`${this.logPrefix} ${action}`, data);
  }

  /**
   * Protected helper: Log error
   */
  protected logError(action: string, error: unknown): void {
    logger.error(
      `${this.logPrefix} ${action} failed`,
      error instanceof Error ? error : undefined
    );
  }

  /**
   * Protected helper: Measure execution time
   */
  protected async measureExecution<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  }
}

// ==========================================
// TOOL REGISTRY
// ==========================================

export class ToolRegistry {
  private tools: Map<string, ITool> = new Map();

  /**
   * Register a tool
   */
  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool ${tool.name} already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
    logger.info(`Registered tool: ${tool.name}`);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): ITool[] {
    return this.getAll().filter((tool) =>
      tool.name.toLowerCase().includes(category.toLowerCase())
    );
  }

  /**
   * Execute a tool by name
   */
  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found`,
      };
    }

    // Validate parameters
    const validation = tool.validate(params);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(", ")}`,
      };
    }

    // Execute tool
    try {
      return await tool.execute(params, context);
    } catch (error) {
      logger.error(
        `Tool execution failed: ${toolName}`,
        error instanceof Error ? error : undefined
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get tool metadata for AI prompt
   */
  getToolsMetadata(): string {
    const tools = this.getAll();

    return tools
      .map((tool) => {
        const meta = tool.getMetadata();
        return `
**${meta.name}**
${meta.description}

Parameters:
${meta.parameters
  .map(
    (p) =>
      `- ${p.name} (${p.type}${p.required ? ", required" : ", optional"}): ${p.description}`
  )
  .join("\n")}

${meta.examples && meta.examples.length > 0 ? `Examples:\n${meta.examples.join("\n")}` : ""}
      `.trim();
      })
      .join("\n\n---\n\n");
  }
}

// ==========================================
// SINGLETON REGISTRY
// ==========================================

export const toolRegistry = new ToolRegistry();
