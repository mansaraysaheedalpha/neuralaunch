// src/lib/orchestrator/agent-orchestrator.ts
/**
 * Agent Orchestrator
 * Coordinates the execution of all agents in the correct sequence
 */

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { analyzerAgent } from "../agents/analyzer/analyzer.agent";
import { researchAgent } from "../agents/research/research.agent";
import { validationAgent } from "../agents/validation/validation.agent";
import { planningAgent } from "../agents/planning/planning-agent";
import { toError } from "@/lib/error-utils";
// ❌ REMOVE THIS IMPORT - We don't auto-start execution anymore
// import { executionCoordinator } from "./execution-coordinator";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type AgentPhase =
  | "analysis"
  | "research"
  | "validation"
  | "planning"
  | "plan_review" // ✅ NEW PHASE
  | "wave_execution" // ✅ NEW PHASE
  | "complete";

export interface OrchestratorInput {
  projectId: string;
  userId: string;
  conversationId: string;
  blueprint: string;
  startFromPhase?: AgentPhase;
}

export interface PhaseResult {
  phase: AgentPhase;
  agentName: string;
  success: boolean;
  duration: number;
  output?: any;
  error?: string;
}

export interface OrchestratorOutput {
  success: boolean;
  message: string;
  projectId: string;
  completedPhases: PhaseResult[];
  currentPhase: AgentPhase;
  failedAt?: AgentPhase;
  totalDuration: number;
}

// ==========================================
// ORCHESTRATOR CLASS
// ==========================================

export class AgentOrchestrator {
  private readonly name = "AgentOrchestrator";
  private phaseResults: PhaseResult[] = [];

  /**
   * Main execution method - runs all agents in sequence
   */
  async execute(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting orchestration for project ${input.projectId}`
    );

    try {
      // Step 1: Initialize or verify project context
      await this.initializeProjectContext(input);

      // Step 2: Determine starting phase
      const startPhase = input.startFromPhase || "analysis";
      logger.info(`[${this.name}] Starting from phase: ${startPhase}`);

      // Step 3: Execute agent pipeline
      const pipeline = this.getAgentPipeline(startPhase);

      for (const phaseConfig of pipeline) {
        const result = await this.executePhase(phaseConfig, input);
        this.phaseResults.push(result);

        if (!result.success) {
          logger.error(`[${this.name}] Pipeline failed at ${result.phase}`, new Error(result.error || "Unknown error"));

          return {
            success: false,
            message: `Pipeline failed at ${result.phase}: ${result.error}`,
            projectId: input.projectId,
            completedPhases: this.phaseResults,
            currentPhase: result.phase,
            failedAt: result.phase,
            totalDuration: Date.now() - startTime,
          };
        }

        logger.info(`[${this.name}] Completed phase: ${result.phase}`, {
          duration: `${result.duration}ms`,
        });
      }

      // ✅ Step 4: Mark planning complete and STOP for human review
      await this.markPlanReview(input.projectId);

      const totalDuration = Date.now() - startTime;
      logger.info(
        `[${this.name}] Orchestration complete - awaiting plan approval`,
        {
          projectId: input.projectId,
          phases: this.phaseResults.length,
          totalDuration: `${totalDuration}ms`,
        }
      );

      return {
        success: true,
        message:
          "Planning complete! Please review the execution plan before starting Wave 1.",
        projectId: input.projectId,
        completedPhases: this.phaseResults,
        currentPhase: "plan_review", // ✅ NEW: Indicates waiting for human
        totalDuration,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.name}] Orchestration failed:`, toError(error));

      return {
        success: false,
        message: `Orchestration failed: ${errorMessage}`,
        projectId: input.projectId,
        completedPhases: this.phaseResults,
        currentPhase: await this.getCurrentPhase(input.projectId),
        totalDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Initialize project context in database
   */
  private async initializeProjectContext(
    input: OrchestratorInput
  ): Promise<void> {
    const existing = await prisma.projectContext.findUnique({
      where: { projectId: input.projectId },
    });

    if (existing) {
      logger.info(`[${this.name}] Project context already exists`, {
        projectId: input.projectId,
      });
      return;
    }

    await prisma.projectContext.create({
      data: {
        projectId: input.projectId,
        userId: input.userId,
        conversationId: input.conversationId,
        currentPhase: "analysis",
        blueprint: { raw: input.blueprint } as any,
        version: 1,
        planApprovalStatus: "pending", // ✅ NEW FIELD
        planRevisionCount: 0, // ✅ NEW FIELD
      },
    });

    logger.info(`[${this.name}] Created project context`, {
      projectId: input.projectId,
    });
  }

  /**
   * Get agent pipeline based on starting phase
   */
  private getAgentPipeline(startPhase: AgentPhase) {
    const fullPipeline = [
      { phase: "analysis" as AgentPhase, agentName: "AnalyzerAgent" },
      { phase: "research" as AgentPhase, agentName: "ResearchAgent" },
      { phase: "validation" as AgentPhase, agentName: "ValidationAgent" },
      { phase: "planning" as AgentPhase, agentName: "PlanningAgent" },
      // ❌ NO LONGER AUTO-START EXECUTION
    ];

    const startIndex = fullPipeline.findIndex((p) => p.phase === startPhase);
    return startIndex >= 0 ? fullPipeline.slice(startIndex) : fullPipeline;
  }

  /**
   * Execute a single phase
   */
  private async executePhase(
    phaseConfig: { phase: AgentPhase; agentName: string },
    input: OrchestratorInput
  ): Promise<PhaseResult> {
    const startTime = Date.now();
    const { phase, agentName } = phaseConfig;

    logger.info(`[${this.name}] Executing phase: ${phase}`);

    try {
      // ✅ Update phase in database BEFORE running the agent
      // This allows the UI to show real-time progress
      await prisma.projectContext.update({
        where: { projectId: input.projectId },
        data: {
          currentPhase: phase,
          updatedAt: new Date(),
        },
      });

      let output: any;

      switch (phase) {
        case "analysis":
          output = await this.runAnalyzer(input);
          break;
        case "research":
          output = await this.runResearch(input);
          break;
        case "validation":
          output = await this.runValidation(input);
          break;
        case "planning":
          output = await this.runPlanning(input);
          break;
        default:
          throw new Error(`Unknown phase: ${phase}`);
      }

      return {
        phase,
        agentName,
        success: true,
        duration: Date.now() - startTime,
        output,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        phase,
        agentName,
        success: false,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Run Analyzer Agent
   */
  private async runAnalyzer(input: OrchestratorInput) {
    const result = await analyzerAgent.execute({
      projectId: input.projectId,
      userId: input.userId,
      conversationId: input.conversationId,
      blueprint: input.blueprint,
    });

    if (!result.success) {
      throw new Error(result.message);
    }

    return result;
  }

  /**
   * Run Research Agent
   */
  private async runResearch(input: OrchestratorInput) {
    const result = await researchAgent.execute({
      projectId: input.projectId,
      userId: input.userId,
      conversationId: input.conversationId,
    });

    if (!result.success) {
      throw new Error(result.message);
    }

    return result;
  }

  /**
   * Run Validation Agent
   */
  private async runValidation(input: OrchestratorInput) {
    const result = await validationAgent.execute({
      projectId: input.projectId,
      userId: input.userId,
      conversationId: input.conversationId,
    });

    if (!result.success) {
      throw new Error(result.message);
    }

    return result;
  }

  /**
   * Run Planning Agent
   */
  private async runPlanning(input: OrchestratorInput) {
    const result = await planningAgent.execute({
      projectId: input.projectId,
      userId: input.userId,
      conversationId: input.conversationId,
    });

    if (!result.success) {
      throw new Error(result.message);
    }

    return result;
  }

  /**
   * ✅ NEW: Mark plan as ready for review
   */
  private async markPlanReview(projectId: string): Promise<void> {
    await prisma.projectContext.update({
      where: { projectId },
      data: {
        currentPhase: "plan_review",
        planApprovalStatus: "pending",
        updatedAt: new Date(),
      },
    });

    logger.info(`[${this.name}] Project marked for plan review`, { projectId });
  }

  /**
   * Get current phase from database
   */
  private async getCurrentPhase(projectId: string): Promise<AgentPhase> {
    const context = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { currentPhase: true },
    });

    return (context?.currentPhase || "analysis") as AgentPhase;
  }

  /**
   * Get orchestration status for a project
   */
  async getStatus(projectId: string): Promise<{
    currentPhase: AgentPhase;
    completedPhases: string[];
    lastUpdated: Date | null;
    planApprovalStatus?: string; // ✅ NEW
  }> {
    const context = await prisma.projectContext.findUnique({
      where: { projectId },
      select: {
        currentPhase: true,
        updatedAt: true,
        planApprovalStatus: true, // ✅ NEW
      },
    });

    if (!context) {
      throw new Error("Project not found");
    }

    // Get completed executions
    const executions = await prisma.agentExecution.findMany({
      where: {
        projectId,
        success: true,
      },
      select: { phase: true },
      distinct: ["phase"],
    });

    return {
      currentPhase: context.currentPhase as AgentPhase,
      completedPhases: executions.map((e) => e.phase),
      lastUpdated: context.updatedAt,
      planApprovalStatus: context.planApprovalStatus || undefined, // ✅ NEW
    };
  }

  /**
   * Resume orchestration from current phase
   */
  async resume(
    projectId: string,
    userId: string,
    conversationId: string
  ): Promise<OrchestratorOutput> {
    logger.info(`[${this.name}] Resuming orchestration for ${projectId}`);

    const context = await prisma.projectContext.findUnique({
      where: { projectId },
      select: {
        currentPhase: true,
        blueprint: true,
      },
    });

    if (!context) {
      throw new Error("Project not found");
    }

    const blueprint = (context.blueprint as any)?.raw || "";

    return this.execute({
      projectId,
      userId,
      conversationId,
      blueprint,
      startFromPhase: context.currentPhase as AgentPhase,
    });
  }

  /**
   * Execute vision-based orchestration (from Agentic Interface)
   * Converts freeform vision text into a technical execution plan
   */
  async executeVision(input: {
    projectId: string;
    userId: string;
    visionText: string;
    projectName: string;
    techPreferences?: {
      frontend?: string;
      backend?: string;
      database?: string;
      deployment?: string;
    };
  }): Promise<OrchestratorOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting vision-based orchestration for project ${input.projectId}`
    );

    try {
      // Convert vision to blueprint-like structure
      // TODO: In a complete implementation, this would use a Vision Planner Agent
      // For now, we'll create a simple blueprint from the vision text
      const generatedBlueprint = `
# ${input.projectName}

## Project Vision
${input.visionText}

## Technical Requirements
${input.techPreferences ? `
### Tech Stack Preferences
- Frontend: ${input.techPreferences.frontend || 'Auto-detect'}
- Backend: ${input.techPreferences.backend || 'Auto-detect'}
- Database: ${input.techPreferences.database || 'Auto-detect'}
- Deployment: ${input.techPreferences.deployment || 'Auto-detect'}
` : 'Tech stack will be auto-detected based on requirements.'}

## Build Instructions
Build a full-stack application based on the vision described above.
`;

      // Execute using the standard orchestration pipeline
      // A conversationId is generated for vision-based projects
      const conversationId = `vision_${input.projectId}`;

      return await this.execute({
        projectId: input.projectId,
        userId: input.userId,
        conversationId,
        blueprint: generatedBlueprint,
      });
    } catch (error) {
      logger.error(
        `[${this.name}] Vision orchestration failed`,
        toError(error)
      );

      return {
        success: false,
        message: `Vision orchestration failed: ${toError(error).message}`,
        projectId: input.projectId,
        completedPhases: this.phaseResults,
        currentPhase: "analysis",
        failedAt: "analysis",
        totalDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute blueprint-based orchestration (from SprintDashboard)
   * Uses validated sprint data to inform the build
   */
  async executeBlueprint(input: {
    projectId: string;
    userId: string;
    conversationId: string;
    blueprint: string;
    sprintData?: {
      completedTasks?: any[];
      analytics?: any;
      validationResults?: any;
    };
  }): Promise<OrchestratorOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting blueprint-based orchestration for project ${input.projectId}`,
      {
        hasSprintData: !!input.sprintData,
        completedTasks: input.sprintData?.completedTasks?.length || 0,
      }
    );

    try {
      // If sprint data is provided, we can enhance the blueprint with validation insights
      let enhancedBlueprint = input.blueprint;

      if (input.sprintData?.completedTasks && input.sprintData.completedTasks.length > 0) {
        enhancedBlueprint = `${input.blueprint}

---

## Sprint Validation Results

### Completed Validation Tasks
${input.sprintData.completedTasks.map((task: any, index: number) => 
  `${index + 1}. ${task.title || task.id} - ${task.status}`
).join('\n')}

### Validation Insights
- Total tasks completed: ${input.sprintData.completedTasks.length}
- Completion rate: ${input.sprintData.analytics?.completionRate || 0}%
- Validated features: ${input.sprintData.validationResults?.features?.join(', ') || 'N/A'}

**Note**: Prioritize features that were successfully validated during the sprint.
`;
      }

      // Execute using the standard orchestration pipeline
      return await this.execute({
        projectId: input.projectId,
        userId: input.userId,
        conversationId: input.conversationId,
        blueprint: enhancedBlueprint,
      });
    } catch (error) {
      logger.error(
        `[${this.name}] Blueprint orchestration failed`,
        toError(error)
      );

      return {
        success: false,
        message: `Blueprint orchestration failed: ${toError(error).message}`,
        projectId: input.projectId,
        completedPhases: this.phaseResults,
        currentPhase: "analysis",
        failedAt: "analysis",
        totalDuration: Date.now() - startTime,
      };
    }
  }
}

// ==========================================
// EXPORT SINGLETON INSTANCE
// ==========================================

export const orchestrator = new AgentOrchestrator();
