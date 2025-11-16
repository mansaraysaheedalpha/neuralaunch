// src/lib/agents/memory/agent-memory.ts
/**
 * Agent Memory System
 * Vector-based memory for agents to learn from past executions
 * Uses Upstash Vector for semantic search and similarity matching
 */

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { toError } from "@/lib/error-utils";
import OpenAI from "openai";
import { Index } from "@upstash/vector";

// ==========================================
// TYPES
// ==========================================

export interface MemoryEntry {
  id: string;
  agentName: string;
  taskType: string;
  success: boolean;
  context: {
    taskTitle: string;
    complexity: string;
    estimatedLines: number;
    filesCreated: string[];
    technologies: string[];
  };
  outcome: {
    iterations: number;
    durationMs: number;
    error?: string;
  };
  learnings: string[]; // Key lessons learned
  timestamp: Date;
}

export interface MemoryQuery {
  agentName: string;
  taskType?: string;
  complexity?: string;
  technologies?: string[];
  successOnly?: boolean;
  limit?: number;
}

export interface MemoryInsight {
  pattern: string;
  occurrences: number;
  successRate: number;
  avgIterations: number;
  recommendation: string;
}

// ==========================================
// AGENT MEMORY CLASS
// ==========================================

export class AgentMemory {
  private readonly name = "AgentMemory";
  private vectorIndex: Index | null = null;
  private openai: OpenAI | null = null;
  private vectorEnabled = false;

  constructor() {
    this.initializeVectorDB();
  }

  /**
   * Initialize vector database connection
   */
  private initializeVectorDB(): void {
    try {
      const upstashUrl = process.env.UPSTASH_VECTOR_REST_URL;
      const upstashToken = process.env.UPSTASH_VECTOR_REST_TOKEN;
      const openaiKey = process.env.OPENAI_API_KEY;

      if (upstashUrl && upstashToken && openaiKey) {
        this.vectorIndex = new Index({
          url: upstashUrl,
          token: upstashToken,
        });

        this.openai = new OpenAI({ apiKey: openaiKey });
        this.vectorEnabled = true;
        logger.info(`[${this.name}] Vector database initialized (Upstash)`);
      } else {
        logger.warn(
          `[${this.name}] Vector database not configured. Set UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN, and OPENAI_API_KEY to enable semantic search.`
        );
        logger.info(`[${this.name}] Falling back to Prisma-only storage`);
      }
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to initialize vector database`,
        toError(error)
      );
      logger.info(`[${this.name}] Falling back to Prisma-only storage`);
      this.vectorEnabled = false;
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error("OpenAI client not initialized");
    }

    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small", // 1536 dimensions, cost-effective
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate embedding`, toError(error));
      throw error;
    }
  }

  /**
   * Create searchable text from memory entry
   */
  private createSearchableText(entry: Omit<MemoryEntry, "id" | "timestamp">): string {
    const parts = [
      `Agent: ${entry.agentName}`,
      `Task: ${entry.context.taskTitle}`,
      `Type: ${entry.taskType}`,
      `Complexity: ${entry.context.complexity}`,
      `Technologies: ${entry.context.technologies.join(", ")}`,
      `Files: ${entry.context.filesCreated.join(", ")}`,
      `Learnings: ${entry.learnings.join(". ")}`,
      `Success: ${entry.success}`,
    ];

    if (entry.outcome.error) {
      parts.push(`Error: ${entry.outcome.error}`);
    }

    return parts.join("\n");
  }

  /**
   * Store a memory entry from task execution
   */
  async store(entry: Omit<MemoryEntry, "id" | "timestamp">): Promise<string> {
    logger.info(`[${this.name}] Storing memory`, {
      agent: entry.agentName,
      task: entry.context.taskTitle,
      success: entry.success,
    });

    try {
      // Store in AgentExecution table with metadata
      const memory = await prisma.agentExecution.create({
        data: {
          projectId: "memory", // Special project ID for memories
          agentName: entry.agentName,
          phase: "memory",
          input: {
            taskType: entry.taskType,
            context: entry.context,
          } as {
            taskType: string;
            context: MemoryEntry["context"];
          },
          output: {
            outcome: entry.outcome,
            learnings: entry.learnings,
          } as {
            outcome: MemoryEntry["outcome"];
            learnings: string[];
          },
          success: entry.success,
          durationMs: entry.outcome.durationMs,
          error: entry.outcome.error,
        },
      });

      // Store in vector database for semantic search (production-ready)
      if (this.vectorEnabled && this.vectorIndex) {
        try {
          const searchableText = this.createSearchableText(entry);
          const embedding = await this.generateEmbedding(searchableText);

          await this.vectorIndex.upsert({
            id: memory.id,
            vector: embedding,
            metadata: {
              agentName: entry.agentName,
              taskType: entry.taskType,
              taskTitle: entry.context.taskTitle,
              complexity: entry.context.complexity,
              technologies: entry.context.technologies.join(","),
              success: entry.success,
              timestamp: new Date().toISOString(),
            },
          });

          logger.info(`[${this.name}] Memory stored in vector database`, {
            memoryId: memory.id,
          });
        } catch (vectorError) {
          // Log error but don't fail the entire operation
          logger.error(
            `[${this.name}] Failed to store in vector database (Prisma storage succeeded)`,
            toError(vectorError)
          );
        }
      }

      logger.info(`[${this.name}] Memory stored`, { memoryId: memory.id });

      return memory.id;
    } catch (error) {
      logger.error(`[${this.name}] Failed to store memory`, toError(error));
      throw error;
    }
  }

  /**
   * Create query text from MemoryQuery for semantic search
   */
  private createQueryText(query: MemoryQuery): string {
    const parts = [`Agent: ${query.agentName}`];

    if (query.taskType) {
      parts.push(`Task Type: ${query.taskType}`);
    }

    if (query.complexity) {
      parts.push(`Complexity: ${query.complexity}`);
    }

    if (query.technologies && query.technologies.length > 0) {
      parts.push(`Technologies: ${query.technologies.join(", ")}`);
    }

    return parts.join("\n");
  }

  /**
   * Retrieve relevant memories for a task using semantic search
   */
  async retrieve(query: MemoryQuery): Promise<MemoryEntry[]> {
    logger.info(`[${this.name}] Retrieving memories`, { ...query });

    try {
      let memoryIds: string[] = [];

      // Use vector database for semantic search if available
      if (this.vectorEnabled && this.vectorIndex) {
        try {
          const queryText = this.createQueryText(query);
          const queryEmbedding = await this.generateEmbedding(queryText);

          // Build metadata filter for vector search
          const filter: string[] = [];
          filter.push(`agentName = '${query.agentName}'`);

          if (query.taskType) {
            filter.push(`taskType = '${query.taskType}'`);
          }

          if (query.complexity) {
            filter.push(`complexity = '${query.complexity}'`);
          }

          if (query.successOnly !== undefined) {
            filter.push(`success = ${query.successOnly}`);
          }

          // Query vector database
          const vectorResults = await this.vectorIndex.query({
            vector: queryEmbedding,
            topK: query.limit || 10,
            includeMetadata: true,
            filter: filter.length > 0 ? filter.join(" AND ") : undefined,
          });

          memoryIds = vectorResults.map((result) => String(result.id));

          logger.info(
            `[${this.name}] Vector search found ${memoryIds.length} similar memories`
          );
        } catch (vectorError) {
          logger.error(
            `[${this.name}] Vector search failed, falling back to Prisma`,
            toError(vectorError)
          );
          // Fall through to Prisma-based search
        }
      }

      // If vector search was used, fetch by IDs in order
      if (memoryIds.length > 0) {
        const executions = await prisma.agentExecution.findMany({
          where: {
            id: { in: memoryIds },
            projectId: "memory",
            phase: "memory",
          },
        });

        // Maintain the order from vector search results
        const executionMap = new Map(executions.map((e) => [e.id, e]));
        const orderedExecutions = memoryIds
          .map((id) => executionMap.get(id))
          .filter((e): e is NonNullable<typeof e> => e !== undefined);

        // Define types for input and output fields
        type AgentExecutionInput = {
          taskType: string;
          context: MemoryEntry["context"];
        };
        type AgentExecutionOutput = {
          outcome: MemoryEntry["outcome"];
          learnings: string[];
        };

        const memories: MemoryEntry[] = orderedExecutions.map((e) => {
          const input = e.input as AgentExecutionInput;
          const output = e.output as AgentExecutionOutput;
          return {
            id: e.id,
            agentName: e.agentName,
            taskType: input.taskType,
            success: e.success,
            context: input.context,
            outcome: output.outcome,
            learnings: output.learnings || [],
            timestamp: e.createdAt,
          };
        });

        logger.info(`[${this.name}] Retrieved ${memories.length} memories`);
        return memories;
      }

      // Fallback to Prisma-based search
      logger.info(`[${this.name}] Using Prisma-based search`);

      // Build where clause
      const where: Prisma.AgentExecutionWhereInput = {
        projectId: "memory",
        agentName: query.agentName,
        phase: "memory",
      };

      if (query.successOnly !== undefined) {
        where.success = query.successOnly;
      }

      // Query database
      const executions = await prisma.agentExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit || 10,
      });

      // Define types for input and output fields
      type AgentExecutionInput = {
        taskType: string;
        context: MemoryEntry["context"];
      };
      type AgentExecutionOutput = {
        outcome: MemoryEntry["outcome"];
        learnings: string[];
      };

      // Convert to MemoryEntry format
      const memories: MemoryEntry[] = executions
        .filter((e) => {
          const input = e.input as AgentExecutionInput;

          // Filter by taskType if specified
          if (query.taskType && input.taskType !== query.taskType) {
            return false;
          }

          // Filter by complexity if specified
          if (
            query.complexity &&
            input.context?.complexity !== query.complexity
          ) {
            return false;
          }

          // Filter by technologies if specified
          if (
            query.technologies &&
            (!input.context?.technologies ||
              !query.technologies.every((tech) =>
                input.context.technologies.includes(tech)
              ))
          ) {
            return false;
          }

          return true;
        })
        .map((e) => {
          const input = e.input as AgentExecutionInput;
          const output = e.output as AgentExecutionOutput;
          return {
            id: e.id,
            agentName: e.agentName,
            taskType: input.taskType,
            success: e.success,
            context: input.context,
            outcome: output.outcome,
            learnings: output.learnings || [],
            timestamp: e.createdAt,
          };
        });

      logger.info(`[${this.name}] Retrieved ${memories.length} memories`);

      return memories;
    } catch (error) {
      logger.error(`[${this.name}] Failed to retrieve memories`, toError(error));
      return [];
    }
  }

  /**
   * Get insights from past executions
   */
  async getInsights(
    agentName: string,
    taskType?: string
  ): Promise<MemoryInsight[]> {
    logger.info(`[${this.name}] Generating insights`, { agentName, taskType });

    try {
      const memories = await this.retrieve({
        agentName,
        taskType,
        limit: 100,
      });

      if (memories.length === 0) {
        return [];
      }

      // Analyze patterns
      const insights: MemoryInsight[] = [];

      // Insight 1: Overall success rate
      const successful = memories.filter((m) => m.success).length;
      const successRate = successful / memories.length;

      insights.push({
        pattern: "Overall Performance",
        occurrences: memories.length,
        successRate: Math.round(successRate * 100),
        avgIterations:
          memories.reduce((sum, m) => sum + m.outcome.iterations, 0) /
          memories.length,
        recommendation:
          successRate > 0.8
            ? "Strong performance, maintain current approach"
            : "Below 80% success rate, review error patterns",
      });

      // Insight 2: Complexity impact
      const simpleMemories = memories.filter(
        (m) => m.context.complexity === "simple"
      );
      const mediumMemories = memories.filter(
        (m) => m.context.complexity === "medium"
      );

      if (simpleMemories.length > 0) {
        const simpleSuccess =
          simpleMemories.filter((m) => m.success).length /
          simpleMemories.length;
        insights.push({
          pattern: "Simple Tasks",
          occurrences: simpleMemories.length,
          successRate: Math.round(simpleSuccess * 100),
          avgIterations:
            simpleMemories.reduce((sum, m) => sum + m.outcome.iterations, 0) /
            simpleMemories.length,
          recommendation:
            simpleSuccess > 0.9
              ? "Excellent on simple tasks"
              : "Struggling with simple tasks, check prompts",
        });
      }

      if (mediumMemories.length > 0) {
        const mediumSuccess =
          mediumMemories.filter((m) => m.success).length /
          mediumMemories.length;
        insights.push({
          pattern: "Medium Tasks",
          occurrences: mediumMemories.length,
          successRate: Math.round(mediumSuccess * 100),
          avgIterations:
            mediumMemories.reduce((sum, m) => sum + m.outcome.iterations, 0) /
            mediumMemories.length,
          recommendation:
            mediumSuccess > 0.7
              ? "Good on medium complexity"
              : "Consider splitting medium tasks further",
        });
      }

      // Insight 3: Common failure patterns
      const failures = memories.filter((m) => !m.success);
      if (failures.length > 0) {
        const errorPatterns = new Map<string, number>();

        failures.forEach((f) => {
          if (f.outcome.error) {
            const errorType = this.categorizeError(f.outcome.error);
            errorPatterns.set(
              errorType,
              (errorPatterns.get(errorType) || 0) + 1
            );
          }
        });

        errorPatterns.forEach((count, pattern) => {
          insights.push({
            pattern: `Failure: ${pattern}`,
            occurrences: count,
            successRate: 0,
            avgIterations:
              failures
                .filter(
                  (f) => this.categorizeError(f.outcome.error || "") === pattern
                )
                .reduce((sum, f) => sum + f.outcome.iterations, 0) / count,
            recommendation: this.getErrorRecommendation(pattern),
          });
        });
      }

      logger.info(`[${this.name}] Generated ${insights.length} insights`);

      return insights;
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate insights`, toError(error));
      return [];
    }
  }

  /**
   * Get relevant context from past similar tasks
   */
  async getRelevantContext(
    agentName: string,
    taskTitle: string,
    technologies: string[]
  ): Promise<string> {
    const memories = await this.retrieve({
      agentName,
      technologies,
      successOnly: true,
      limit: 5,
    });

    if (memories.length === 0) {
      return "No relevant past experience found.";
    }

    const context = memories
      .map((m) =>
        `
**Similar Task:** ${m.context.taskTitle}
- Complexity: ${m.context.complexity}
- Files: ${m.context.filesCreated.join(", ")}
- Iterations: ${m.outcome.iterations}
- Duration: ${Math.round(m.outcome.durationMs / 1000)}s
- Learnings: ${m.learnings.join("; ")}
    `.trim()
      )
      .join("\n\n");

    return `**Relevant Past Experience:**\n\n${context}`;
  }

  /**
   * Categorize error for pattern matching
   */
  private categorizeError(error: string): string {
    const lowerError = error.toLowerCase();

    if (lowerError.includes("syntax") || lowerError.includes("parse")) {
      return "Syntax Error";
    }
    if (lowerError.includes("type") || lowerError.includes("typescript")) {
      return "Type Error";
    }
    if (
      lowerError.includes("dependency") ||
      lowerError.includes("module not found")
    ) {
      return "Dependency Issue";
    }
    if (lowerError.includes("timeout") || lowerError.includes("time limit")) {
      return "Timeout";
    }
    if (
      lowerError.includes("too large") ||
      lowerError.includes("exceeded limit")
    ) {
      return "Size Exceeded";
    }

    return "Other";
  }

  /**
   * Get recommendation for error pattern
   */
  private getErrorRecommendation(pattern: string): string {
    const recommendations: Record<string, string> = {
      "Syntax Error": "Improve code generation prompts, add syntax validation",
      "Type Error": "Enhance TypeScript type definitions in prompts",
      "Dependency Issue": "Auto-install dependencies before code execution",
      Timeout: "Optimize code or increase timeout limits",
      "Size Exceeded": "Split tasks into smaller atomic units",
      Other: "Manual review of error patterns needed",
    };

    return recommendations[pattern] || "No specific recommendation";
  }

  /**
   * Clear old memories (cleanup)
   */
  async clearOldMemories(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Find IDs to delete before deleting from Prisma
    const oldMemories = await prisma.agentExecution.findMany({
      where: {
        projectId: "memory",
        createdAt: {
          lt: cutoffDate,
        },
      },
      select: { id: true },
    });

    const memoryIds = oldMemories.map((m) => m.id);

    // Delete from Prisma
    const result = await prisma.agentExecution.deleteMany({
      where: {
        projectId: "memory",
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    // Delete from vector database if enabled
    if (this.vectorEnabled && this.vectorIndex && memoryIds.length > 0) {
      try {
        await this.vectorIndex.delete(memoryIds);
        logger.info(
          `[${this.name}] Cleared ${memoryIds.length} memories from vector database`
        );
      } catch (vectorError) {
        logger.error(
          `[${this.name}] Failed to clear memories from vector database`,
          toError(vectorError)
        );
      }
    }

    logger.info(`[${this.name}] Cleared ${result.count} old memories`);

    return result.count;
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const agentMemory = new AgentMemory();
