// src/lib/agents/optimization/optimization-agent.ts
/**
 * Optimization Agent - Automated Performance & Reliability Improvements
 *
 * Responsibilities:
 * 1. Analyze monitoring recommendations
 * 2. Automatically apply performance optimizations
 * 3. Implement caching strategies
 * 4. Add database indexes
 * 5. Optimize API endpoints
 * 6. Implement rate limiting
 * 7. Add error handling improvements
 * 8. Configure CDN and static asset optimization
 *
 * Truly generic - works with ANY tech stack
 */

import { AI_MODELS } from "@/lib/models";
import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

// ==========================================
// TYPES
// ==========================================

export interface OptimizationRecommendation {
  category: "performance" | "reliability" | "cost" | "security";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  effort: string;
  implementation: string;
}

export interface OptimizationTask {
  id: string;
  recommendation: OptimizationRecommendation;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  filesModified: string[];
  changes: string[];
  error?: string;
}

export interface OptimizationResult {
  tasksCompleted: number;
  tasksFailed: number;
  tasksSkipped: number;
  filesModified: string[];
  optimizations: OptimizationTask[];
  summary: string;
  estimatedImpact: {
    performanceImprovement?: string;
    costReduction?: string;
    reliabilityImprovement?: string;
  };
}

/**
 * Load entire project structure
 */
// Define a proper type for project structure
interface ProjectStructure {
  files: Array<{ path: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface OptimizationChange {
  file: string;
  type: "modify" | "create";
  description: string;
  code: string;
}

export interface OptimizationInput extends AgentExecutionInput {
  recommendations: OptimizationRecommendation[];
  deploymentUrl?: string;
  autoApply?: boolean; // If false, generate PR instead
  maxOptimizations?: number; // Limit number of optimizations to apply
}

// ==========================================
// OPTIMIZATION AGENT CLASS
// ==========================================

export class OptimizationAgent extends BaseAgent {
  constructor() {
    super({
      name: "OptimizationAgent",
      category: "quality",
      description:
        "Automatically apply monitoring recommendations and performance optimizations",
      supportedTaskTypes: [
        "performance_optimization",
        "reliability_improvement",
        "cost_optimization",
        "security_hardening",
      ],
      requiredTools: [
        "filesystem",
        "command",
        "code_analysis",
        "context_loader",
        "web_search", // For finding optimization patterns
      ],
      modelName: AI_MODELS.OPENAI, // GPT-4o for intelligent code modifications
    });
  }

  /**
   * Execute optimization task
   */
  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const startTime = Date.now();
    const { taskId, projectId, userId, taskDetails } = input;
    const optimizationInput = taskDetails as unknown as OptimizationInput;

    logger.info(`[${this.name}] Starting optimization`, {
      taskId,
      projectId,
      recommendations: optimizationInput.recommendations?.length || 0,
    });

    try {
      const recommendations = optimizationInput.recommendations || [];

      if (recommendations.length === 0) {
        return {
          success: true,
          message: "No recommendations to apply",
          iterations: 1,
          durationMs: Date.now() - startTime,
          data: {
            tasksCompleted: 0,
            tasksFailed: 0,
            tasksSkipped: 0,
            filesModified: [],
            optimizations: [],
            summary: "No optimization recommendations provided",
          },
        };
      }

      // Step 1: Load project context and tech stack
      const projectContext: {
        techStack: Record<string, unknown>;
        architecture: Record<string, unknown>;
      } = await this.loadProjectContextData(projectId);

      // Step 2: Load project structure
      const projectStructure: ProjectStructure =
        await this.loadProjectStructure(projectId, userId);

      // Step 3: Prioritize recommendations
      const prioritizedRecommendations = this.prioritizeRecommendations(
        recommendations,
        optimizationInput.maxOptimizations
      );

      logger.info(
        `[${this.name}] Applying ${prioritizedRecommendations.length} optimizations`
      );

      // Step 4: Apply each optimization
      const optimizationTasks: OptimizationTask[] = [];

      for (const recommendation of prioritizedRecommendations) {
        const task = await this.applyOptimization(
          recommendation,
          projectId,
          userId,
          projectContext,
          projectStructure
        );

        optimizationTasks.push(task);

        // Stop if too many failures
        const failures = optimizationTasks.filter(
          (t) => t.status === "failed"
        ).length;
        if (failures >= 3) {
          logger.warn(
            `[${this.name}] Stopping optimization due to ${failures} failures`
          );
          break;
        }
      }

      // Step 5: Calculate results
      const tasksCompleted = optimizationTasks.filter(
        (t) => t.status === "completed"
      ).length;
      const tasksFailed = optimizationTasks.filter(
        (t) => t.status === "failed"
      ).length;
      const tasksSkipped = optimizationTasks.filter(
        (t) => t.status === "skipped"
      ).length;

      // Step 6: Collect all modified files
      const filesModified = [
        ...new Set(optimizationTasks.flatMap((t) => t.filesModified)),
      ];

      // Step 7: Estimate impact
      const estimatedImpact = this.estimateImpact(optimizationTasks);

      // Step 8: Generate summary
      const summary = await this.generateSummary(
        optimizationTasks,
        estimatedImpact
      );

      const result: OptimizationResult = {
        tasksCompleted,
        tasksFailed,
        tasksSkipped,
        filesModified,
        optimizations: optimizationTasks,
        summary,
        estimatedImpact,
      };

      // Step 9: Store optimization results
      await this.storeOptimizationResults(taskId, projectId, result);

      // Step 10: Create PR or commit directly (based on autoApply setting)
      if (filesModified.length > 0) {
        if (optimizationInput.autoApply !== false) {
          await this.commitChanges(
            projectId,
            userId,
            filesModified,
            optimizationTasks
          );
        } else {
          await this.createOptimizationPR(
            projectId,
            userId,
            filesModified,
            optimizationTasks
          );
        }
      }

      logger.info(`[${this.name}] Optimization complete`, {
        taskId,
        completed: tasksCompleted,
        failed: tasksFailed,
        skipped: tasksSkipped,
        filesModified: filesModified.length,
      });

      return {
        success: true,
        message: `Applied ${tasksCompleted} optimization(s), modified ${filesModified.length} file(s)`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        data: { ...result },
      };
    } catch (error) {
      logger.error(
        `[${this.name}] Optimization failed`,
        error instanceof Error ? error : new Error(String(error)),
        { taskId }
      );

      return {
        success: false,
        message: `Optimization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: error instanceof Error ? error.message : "Unknown error",
      } as AgentExecutionOutput;
    }
  }

  /**
   * Load project context from database
   */
  private async loadProjectContextData(projectId: string): Promise<{
    techStack: Record<string, unknown>;
    architecture: Record<string, unknown>;
  }> {
    const context = await prisma.projectContext.findUnique({
      where: { projectId },
      select: {
        techStack: true,
        architecture: true,
      },
    });

    if (!context) {
      throw new Error(`Project context not found for ${projectId}`);
    }

    return {
      techStack: (context.techStack ?? {}) as Record<string, unknown>,
      architecture: (context.architecture ?? {}) as Record<string, unknown>,
    };
  }

  private async loadProjectStructure(
    projectId: string,
    userId: string
  ): Promise<ProjectStructure> {
    logger.info(`[${this.name}] Loading project structure`);

    const contextResult = await this.executeTool(
      "context_loader",
      {
        projectId,
        includeFiles: true,
        maxDepth: 5,
      },
      { projectId, userId }
    );

    if (!contextResult.success) {
      throw new Error("Failed to load project structure");
    }

    return contextResult.data as ProjectStructure;
  }

  /**
   * Prioritize recommendations by priority and feasibility
   */
  private prioritizeRecommendations(
    recommendations: OptimizationRecommendation[],
    maxOptimizations?: number
  ): OptimizationRecommendation[] {
    // Sort by priority (high first)
    const sorted = [...recommendations].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Limit to maxOptimizations if specified
    if (maxOptimizations && maxOptimizations > 0) {
      return sorted.slice(0, maxOptimizations);
    }

    return sorted;
  }

  /**
   * Apply a single optimization
   */
  private async applyOptimization(
    recommendation: OptimizationRecommendation,
    projectId: string,
    userId: string,
    projectContext: {
      techStack: Record<string, unknown>;
      architecture: Record<string, unknown>;
    },
    projectStructure: ProjectStructure
  ): Promise<OptimizationTask> {
    logger.info(
      `[${this.name}] Applying optimization: ${recommendation.title}`
    );

    const task: OptimizationTask = {
      id: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      recommendation,
      status: "in_progress",
      filesModified: [],
      changes: [],
    };

    try {
      // Determine optimization type and apply
      const result = await this.executeOptimization(
        recommendation,
        projectId,
        userId,
        projectContext,
        projectStructure
      );

      task.status = result.success ? "completed" : "failed";
      task.filesModified = result.filesModified || [];
      task.changes = result.changes || [];
      task.error = result.error;

      logger.info(
        `[${this.name}] Optimization ${task.status}: ${recommendation.title}`
      );
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : "Unknown error";

      logger.error(
        `[${this.name}] Optimization failed: ${recommendation.title}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    return task;
  }

  /**
   * Execute specific optimization based on category
   */
  private async executeOptimization(
    recommendation: OptimizationRecommendation,
    projectId: string,
    userId: string,
    projectContext: {
      techStack: Record<string, unknown>;
      architecture: Record<string, unknown>;
    },
    projectStructure: ProjectStructure
  ): Promise<{
    success: boolean;
    filesModified?: string[];
    changes?: string[];
    error?: string;
  }> {
    const { category, title, implementation } = recommendation;

    // Use AI to generate code changes
    const prompt = `You are an expert software optimization engineer.

Project Tech Stack:
${JSON.stringify(projectContext.techStack, null, 2)}

Optimization Recommendation:
Title: ${title}
Category: ${category}
Implementation: ${implementation}

Available Project Files:
${JSON.stringify(projectStructure?.files?.slice(0, 50).map((f: { path: string; [key: string]: unknown }) => f.path || f) || [], null, 2)}

Task: Generate the specific code changes needed to implement this optimization.

For each file that needs to be modified, provide:
1. File path
2. Exact code changes (with line numbers if possible)
3. Explanation of what the change does

Return JSON:
{
  "changes": [
    {
      "file": "path/to/file.ts",
      "type": "modify" | "create",
      "description": "Add Redis caching layer",
      "code": "// Full file content or changes"
    }
  ],
  "additionalSteps": [
    "Run: npm install redis",
    "Add REDIS_URL to environment variables"
  ]
}

Respond ONLY with valid JSON, no markdown.`;

    try {
      const text = await this.generateContent(prompt);

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse AI response");
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        changes?: OptimizationChange[];
        additionalSteps?: string[];
      };
      // Basic runtime type check
      if (
        typeof parsed !== "object" ||
        !parsed ||
        (parsed.changes && !Array.isArray(parsed.changes)) ||
        (parsed.additionalSteps && !Array.isArray(parsed.additionalSteps))
      ) {
        throw new Error("AI response JSON does not match expected structure");
      }
      const optimizationPlan: {
        changes?: OptimizationChange[];
        additionalSteps?: string[];
      } = parsed;
      const changes: OptimizationChange[] = optimizationPlan.changes || [];
      const additionalSteps: string[] = optimizationPlan.additionalSteps || [];

      const filesModified: string[] = [];
      const changeDescriptions: string[] = [];

      // Apply each change
      for (const change of changes) {
        if (change.type === "create" || change.type === "modify") {
          // Write file
          const writeResult = await this.executeTool(
            "filesystem",
            {
              operation: "write",
              path: change.file,
              content: change.code,
            },
            { projectId, userId }
          );

          if (writeResult.success) {
            filesModified.push(change.file);
            changeDescriptions.push(
              `${change.type}: ${change.file} - ${change.description}`
            );
          }
        }
      }

      // Execute additional steps (like npm install)
      for (const step of additionalSteps) {
        if (step.toLowerCase().startsWith("run:")) {
          const command = step.replace(/^run:\s*/i, "");

          await this.executeTool(
            "command",
            { command, timeout: 120000 },
            { projectId, userId }
          );

          changeDescriptions.push(`Executed: ${command}`);
        } else {
          changeDescriptions.push(`Manual step: ${step}`);
        }
      }

      return {
        success: filesModified.length > 0,
        filesModified,
        changes: changeDescriptions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Estimate impact of applied optimizations
   */
  private estimateImpact(tasks: OptimizationTask[]): {
    performanceImprovement?: string;
    costReduction?: string;
    reliabilityImprovement?: string;
  } {
    const completedTasks = tasks.filter((t) => t.status === "completed");

    const impact: {
      performanceImprovement?: string;
      costReduction?: string;
      reliabilityImprovement?: string;
    } = {};

    // Count optimizations by category
    const performanceCount = completedTasks.filter(
      (t) => t.recommendation.category === "performance"
    ).length;

    const costCount = completedTasks.filter(
      (t) => t.recommendation.category === "cost"
    ).length;

    const reliabilityCount = completedTasks.filter(
      (t) => t.recommendation.category === "reliability"
    ).length;

    // Estimate impact percentages
    if (performanceCount > 0) {
      const improvement = Math.min(performanceCount * 15, 60); // 15% per optimization, max 60%
      impact.performanceImprovement = `~${improvement}% faster response times`;
    }

    if (costCount > 0) {
      const reduction = Math.min(costCount * 10, 40); // 10% per optimization, max 40%
      impact.costReduction = `~${reduction}% lower infrastructure costs`;
    }

    if (reliabilityCount > 0) {
      const improvement = Math.min(reliabilityCount * 1, 3); // 1% per optimization, max 3%
      impact.reliabilityImprovement = `~${improvement}% higher uptime`;
    }

    return impact;
  }

  /**
   * Generate optimization summary
   */
  private async generateSummary(
    tasks: OptimizationTask[],
    estimatedImpact: {
      performanceImprovement?: string;
      costReduction?: string;
      reliabilityImprovement?: string;
    }
  ): Promise<string> {
    logger.info(`[${this.name}] Generating summary`);

    const completed = tasks.filter((t) => t.status === "completed");
    const failed = tasks.filter((t) => t.status === "failed");

    const prompt = `Generate a concise optimization summary.

Optimizations Applied: ${completed.length}
Failed: ${failed.length}

Completed Optimizations:
${JSON.stringify(
  completed.map((t) => ({
    title: t.recommendation.title,
    category: t.recommendation.category,
    changes: t.changes,
  })),
  null,
  2
)}

Estimated Impact:
${JSON.stringify(estimatedImpact, null, 2)}

Generate a brief summary (2-3 sentences) covering:
1. What was optimized
2. Expected improvements
3. Next steps (if any)

Write in professional, concise style. No markdown formatting.`;

    try {
      return (await this.generateContent(prompt)).trim();
    } catch (error) {
      logger.warn(`[${this.name}] Failed to generate summary`, { error });

      return `Applied ${completed.length} optimization(s). ${estimatedImpact.performanceImprovement || "Performance improvements expected"}. ${failed.length > 0 ? `${failed.length} optimization(s) failed.` : ""}`;
    }
  }

  /**
   * Store optimization results in database
   */
  private async storeOptimizationResults(
    taskId: string,
    projectId: string,
    result: OptimizationResult
  ): Promise<void> {
    try {
      await prisma.agentTask.update({
        where: { id: taskId },
        data: {
          output: JSON.stringify(result),
          status: "completed",
          completedAt: new Date(),
        },
      });

      logger.info(`[${this.name}] Stored optimization results`, { taskId });
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to store results`,
        error instanceof Error ? error : new Error(String(error)),
        { taskId }
      );
    }
  }

  /**
   * Commit optimization changes
   */
  private async commitChanges(
    projectId: string,
    userId: string,
    filesModified: string[],
    tasks: OptimizationTask[]
  ): Promise<void> {
    logger.info(`[${this.name}] Committing optimization changes`);

    try {
      // Stage files
      const stageResult = await this.executeTool(
        "command",
        {
          command: `git add ${filesModified.join(" ")}`,
        },
        { projectId, userId }
      );

      if (!stageResult.success) {
        throw new Error("Failed to stage files");
      }

      // Create commit message
      const completedTasks = tasks.filter((t) => t.status === "completed");
      const commitMessage = `feat: Apply ${completedTasks.length} optimization(s)

${completedTasks.map((t) => `- ${t.recommendation.title}`).join("\n")}

Auto-generated by OptimizationAgent`;

      // Commit
      const commitResult = await this.executeTool(
        "command",
        {
          command: `git commit -m "${commitMessage}"`,
        },
        { projectId, userId }
      );

      if (!commitResult.success) {
        throw new Error("Failed to commit changes");
      }

      // Push
      const pushResult = await this.executeTool(
        "command",
        {
          command: "git push",
        },
        { projectId, userId }
      );

      if (!pushResult.success) {
        throw new Error("Failed to push changes");
      }

      logger.info(`[${this.name}] Changes committed and pushed`);
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to commit changes`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Create optimization PR
   */
  private async createOptimizationPR(
    projectId: string,
    userId: string,
    filesModified: string[],
    tasks: OptimizationTask[]
  ): Promise<void> {
    logger.info(`[${this.name}] Creating optimization PR`);

    try {
      const completedTasks = tasks.filter((t) => t.status === "completed");

      // Create branch
      const branchName = `optimization/auto-${Date.now()}`;

      await this.executeTool(
        "command",
        {
          command: `git checkout -b ${branchName}`,
        },
        { projectId, userId }
      );

      // Stage and commit
      await this.executeTool(
        "command",
        {
          command: `git add ${filesModified.join(" ")}`,
        },
        { projectId, userId }
      );

      const commitMessage = `feat: Apply ${completedTasks.length} optimization(s)

${completedTasks.map((t) => `- ${t.recommendation.title}`).join("\n")}`;

      await this.executeTool(
        "command",
        {
          command: `git commit -m "${commitMessage}"`,
        },
        { projectId, userId }
      );

      // Push branch
      await this.executeTool(
        "command",
        {
          command: `git push -u origin ${branchName}`,
        },
        { projectId, userId }
      );

      // Create PR (would need GitHub API integration)
      // For now, just log
      logger.info(`[${this.name}] PR branch created: ${branchName}`);
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to create PR`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const optimizationAgent = new OptimizationAgent();
