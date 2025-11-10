// src/lib/agents/memory/agent-memory.ts
/**
 * Agent Memory System
 * Vector-based memory for agents to learn from past executions
 */

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

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
      // For now, store in AgentExecution table with metadata
      // In production, you'd use a vector database like Pinecone/Weaviate
      const memory = await prisma.agentExecution.create({
        data: {
          projectId: "memory", // Special project ID for memories
          agentName: entry.agentName,
          phase: "memory",
          input: {
            taskType: entry.taskType,
            context: entry.context,
          } as any,
          output: {
            outcome: entry.outcome,
            learnings: entry.learnings,
          } as any,
          success: entry.success,
          durationMs: entry.outcome.durationMs,
          error: entry.outcome.error,
        },
      });

      logger.info(`[${this.name}] Memory stored`, { memoryId: memory.id });

      return memory.id;
    } catch (error) {
      logger.error(`[${this.name}] Failed to store memory`, error);
      throw error;
    }
  }

  /**
   * Retrieve relevant memories for a task
   */
  async retrieve(query: MemoryQuery): Promise<MemoryEntry[]> {
    logger.info(`[${this.name}] Retrieving memories`, query);

    try {
      // Build where clause
      const where: any = {
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

      // Convert to MemoryEntry format
      const memories: MemoryEntry[] = executions
        .filter((e) => {
          const input = e.input as any;
          const output = e.output as any;

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
          if (query.technologies && query.technologies.length > 0) {
            const taskTechs = input.context?.technologies || [];
            const hasMatch = query.technologies.some((t) =>
              taskTechs.includes(t)
            );
            if (!hasMatch) return false;
          }

          return true;
        })
        .map((e) => ({
          id: e.id,
          agentName: e.agentName,
          taskType: (e.input as any).taskType,
          success: e.success,
          context: (e.input as any).context,
          outcome: (e.output as any).outcome,
          learnings: (e.output as any).learnings || [],
          timestamp: e.createdAt,
        }));

      logger.info(`[${this.name}] Retrieved ${memories.length} memories`);

      return memories;
    } catch (error) {
      logger.error(`[${this.name}] Failed to retrieve memories`, error);
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
      logger.error(`[${this.name}] Failed to generate insights`, error);
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

    const result = await prisma.agentExecution.deleteMany({
      where: {
        projectId: "memory",
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`[${this.name}] Cleared ${result.count} old memories`);

    return result.count;
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const agentMemory = new AgentMemory();
