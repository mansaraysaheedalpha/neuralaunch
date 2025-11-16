// src/inngest/functions/integration-agent-function.ts
/**
 * Integration Agent Inngest Function
 * Triggered to verify frontend-backend contracts and integration
 *
 * Trigger Points:
 * 1. After each wave completes (quick verification)
 * 2. After Critic Agent completes (deep verification)
 */

import { inngest } from "../client";
import { integrationAgent } from "@/lib/agents/integration/integration-agent";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createAgentError } from "@/lib/error-utils";
import { TechStack } from "@/lib/agents/types/common";
import { Prisma } from "@prisma/client";

interface IntegrationIssue {
  severity?: string;
  category?: string;
  description?: string;
  suggestion?: string;
  frontend?: unknown;
  backend?: unknown;
}

interface IntegrationOutputData {
  compatible?: boolean;
  metrics?: {
    criticalIssues?: number;
    compatibilityScore?: number;
  };
  issues?: IntegrationIssue[];
  recommendations?: unknown[];
  [key: string]: unknown;
}

interface IntegrationTaskInput {
  verificationType?: string;
  waveNumber?: number;
  specificEndpoints?: string[];
}

export const integrationAgentFunction = inngest.createFunction(
  {
    id: "integration-agent-verification",
    name: "Integration Agent - Contract Verification",
    retries: 2,
  },
  { event: "agent/quality.integration" },
  async ({ event, step }) => {
    const { taskId, projectId, userId, conversationId, taskInput } = event.data as {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: IntegrationTaskInput;
    };

    logger.info(`[Inngest] Integration Agent triggered`, {
      taskId,
      projectId,
      verificationType: taskInput.verificationType || "full",
    });

    // Step 1: Get project context
    const projectContext = await step.run("get-project-context", async () => {
      return await prisma.projectContext.findUnique({
        where: { projectId },
        select: { techStack: true, architecture: true },
      });
    });

    if (!projectContext) {
      throw new Error(`Project context not found for ${projectId}`);
    }

    // Step 2: Create integration verification task
    const task = await step.run("create-integration-task", async () => {
      return await prisma.agentTask.create({
        data: {
          projectId,
          agentName: "IntegrationAgent",
          status: "in_progress",
          input: {
            verificationType: taskInput.verificationType || "full",
            waveNumber: taskInput.waveNumber,
            specificEndpoints: taskInput.specificEndpoints,
          },
          startedAt: new Date(),
        },
      });
    });

    // Step 3: Execute Integration Agent
    const result = await step.run("verify-integration", async () => {
      return await integrationAgent.execute({
        taskId: task.id,
        projectId,
        userId,
        conversationId,
        taskDetails: {
          title: "Integration Verification",
          description: "Verify frontend-backend contracts and data flow",
          complexity: "simple",
          estimatedLines: 0,
          verificationType: taskInput.verificationType || "full",
          specificEndpoints: taskInput.specificEndpoints,
        },
        context: {
          techStack: projectContext.techStack as TechStack | undefined,
          architecture: projectContext.architecture,
        },
      });
    });

    // Step 4: Handle verification result
    if (!result.success) {
      logger.error(`[Inngest] Integration verification failed`, createAgentError(result.error || "Unknown error", { taskId: task.id }));

      await step.run("mark-task-failed", async () => {
        await prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            error: result.error,
            completedAt: new Date(),
          },
        });
      });

      // Send failure event
      await inngest.send({
        name: "agent/quality.integration.complete",
        data: {
          taskId: task.id,
          projectId,
          waveNumber: taskInput.waveNumber,
          success: false,
          compatible: false,
          error: result.error,
        },
      });

      return {
        success: false,
        message: result.message,
        error: result.error,
      };
    }

    // Step 5: Check if integration is compatible
    const integrationData = result.data as IntegrationOutputData | undefined;
    const compatible = integrationData?.compatible || false;
    const criticalIssues = integrationData?.metrics?.criticalIssues || 0;
    const compatibilityScore = integrationData?.metrics?.compatibilityScore || 0;

    logger.info(`[Inngest] Integration verification complete`, {
      taskId: task.id,
      compatible,
      criticalIssues,
      compatibilityScore,
      totalIssues: integrationData?.issues?.length || 0,
    });

    // Step 6: Update task status
    await step.run("update-task-status", async () => {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: compatible ? "completed" : "needs_review",
          output: result.data as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    });

    // Step 7: If not compatible and has critical issues, create fix tasks
    if (!compatible && criticalIssues > 0) {
      await step.run("create-fix-tasks", async () => {
        const issues = integrationData?.issues || [];
        const criticalIssuesList = issues.filter(
          (issue: IntegrationIssue) => issue.severity === "critical"
        );

        for (const issue of criticalIssuesList) {
          // Create a task to fix this critical issue
          await prisma.agentTask.create({
            data: {
              projectId,
              agentName: determineFixAgent(issue.category),
              status: "pending",
              input: {
                type: "fix_integration_issue",
                issue: {
                  severity: issue.severity,
                  category: issue.category,
                  description: issue.description,
                  suggestion: issue.suggestion,
                  frontend: issue.frontend as Prisma.InputJsonValue,
                  backend: issue.backend as Prisma.InputJsonValue,
                },
                originalTaskId: task.id,
              } as Prisma.InputJsonValue,
            },
          });
        }

        logger.info(
          `[Inngest] Created ${criticalIssuesList.length} fix tasks for critical issues`,
          { taskId: task.id }
        );
      });
    }

    // Step 8: Send completion event
    await step.run("send-completion-event", async () => {
      await inngest.send({
        name: "agent/quality.integration.complete",
        data: {
          taskId: task.id,
          projectId,
          waveNumber: taskInput.waveNumber,
          success: result.success,
          compatible,
          compatibilityScore,
          criticalIssues,
          totalIssues: integrationData?.issues?.length || 0,
          issues: integrationData?.issues || [],
          recommendations: integrationData?.recommendations || [],
        },
      });
    });

    return {
      success: result.success,
      message: result.message,
      compatible,
      compatibilityScore,
      criticalIssues,
      totalIssues: integrationData?.issues?.length || 0,
    };
  }
);

/**
 * Helper function to determine which agent should fix the issue
 */
function determineFixAgent(category: string | undefined): string {
  switch (category) {
    case "missing_endpoint":
      return "BackendAgent";
    case "contract_mismatch":
    case "type_mismatch":
      // Could be either frontend or backend, default to backend
      return "BackendAgent";
    case "auth_failure":
      return "BackendAgent";
    case "data_model_mismatch":
      return "BackendAgent";
    case "cors_issue":
      return "BackendAgent";
    default:
      return "BackendAgent";
  }
}
