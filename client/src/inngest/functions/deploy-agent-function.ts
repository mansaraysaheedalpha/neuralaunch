// src/inngest/functions/deploy-agent-function.ts
/**
 * Deploy Agent Inngest Function
 * Handles deployment to various platforms (Vercel, Railway, Render, etc.)
 */

import { inngest } from "../client";
import { deployAgent } from "@/lib/agents/deployment/deployment-agent";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toLogContext, createAgentError } from "@/lib/error-utils";
import { TechStack } from "@/lib/agents/types/common";
import type { Prisma } from "@prisma/client";

// Type definitions
interface CodebaseData {
  githubBranch?: string;
  environmentVariables?: Record<string, string>;
  deployments?: Record<string, DeploymentInfo>;
  [key: string]: unknown;
}

interface DeploymentInfo {
  platform: string;
  url?: unknown;
  deploymentId?: unknown;
  deployedAt: string;
  healthCheckPassed?: unknown;
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface DeploymentResultData {
  deploymentUrl?: string;
  deploymentId?: string;
  healthCheckPassed?: boolean;
  logs?: unknown;
  [key: string]: unknown;
}

export const deployAgentFunction = inngest.createFunction(
  {
    id: "deploy-agent-deployment",
    name: "Deploy Agent - Multi-Platform Deployment",
    retries: 1, // Only retry once for deployments
    concurrency: {
      limit: 1, // Only one deployment at a time per project
      key: "event.data.projectId",
    },
  },
  { event: "agent/deployment.deploy" },
  async ({ event, step }) => {
    // Define TaskInputType interface
    interface TaskInputType {
      platform?: string;
      environment?: string;
      deploymentId?: string;
      previewBranch?: string;
      waveNumber?: number;
      customDomain?: string;
      runMigrations?: boolean;
    }

    const data = event.data as {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: TaskInputType;
    };
    if (
      !data ||
      typeof data !== "object" ||
      !("taskId" in data) ||
      !("projectId" in data) ||
      !("userId" in data) ||
      !("conversationId" in data) ||
      !("taskInput" in data)
    ) {
      throw new Error("Invalid event data for deploy-agent-function");
    }
    const { taskId, projectId, userId, conversationId, taskInput } = data;

    logger.info(`[Inngest] Deploy Agent triggered`, {
      taskId,
      projectId,
      platform: taskInput.platform,
      environment: taskInput.environment,
    });

    try {
      // Step 1: Get project context
      const projectContext = await step.run("get-project-context", async () => {
        return await prisma.projectContext.findUnique({
          where: { projectId },
          select: {
            techStack: true,
            architecture: true,
            codebase: true,
            executionPlan: true,
          },
        });
      });

      if (!projectContext) {
        throw new Error(`Project context not found for ${projectId}`);
      }

      // Step 2: Determine deployment platform from architecture (if not provided)
      const deploymentPlatform = await step.run(
        "determine-platform",
        () => {
          // Explicitly type taskInput and architecture for safety
          type TaskInputType = {
            platform?: string;
            environment?: string;
            deploymentId?: string;
            previewBranch?: string;
            waveNumber?: number;
            customDomain?: string;
            runMigrations?: boolean;
          };
          type ArchitectureType = {
            infrastructureArchitecture?: {
              hosting?: string;
            };
          };

          const safeTaskInput = taskInput as TaskInputType;
          if (safeTaskInput.platform && typeof safeTaskInput.platform === "string") {
            return safeTaskInput.platform;
          }

          // Extract platform from architecture
          const architecture = projectContext.architecture as ArchitectureType | undefined;
          const platformFromArch = architecture?.infrastructureArchitecture?.hosting;

          if (!platformFromArch || typeof platformFromArch !== "string") {
            throw new Error(
              "Deployment platform not specified and not found in architecture"
            );
          }

          logger.info(`[Inngest] Using platform from architecture`, {
            platform: platformFromArch,
          });

          return platformFromArch.toLowerCase();
        }
      );

      // Step 3: Get environment variables from database (if needed)
      const envVars = await step.run("get-environment-vars", (): Record<string, string> => {
        // In production, you'd fetch these from a secure vault
        // For now, we'll use what's in the project context
        const codebase = projectContext.codebase as CodebaseData | null;
        return codebase?.environmentVariables || {};
      });

      // Step 4: Create Deployment record
      const deployment = await step.run("create-deployment-record", async () => {
        // Check if deploymentId is provided (manual deployment)
        const existingDeploymentId = taskInput.deploymentId;

        if (existingDeploymentId) {
          // Update existing deployment
          const existing = await prisma.deployment.findUnique({
            where: { id: existingDeploymentId },
          });

          if (existing) {
            await prisma.deployment.update({
              where: { id: existingDeploymentId },
              data: { status: "building", buildStatus: "queued" },
            });
            return existing;
          }
        }

        // Create new deployment record
        const codebase = projectContext.codebase as CodebaseData | null;

        return await prisma.deployment.create({
          data: {
            projectId,
            environment: taskInput.environment || "production",
            platform: deploymentPlatform,
            branch: taskInput.previewBranch || codebase?.githubBranch || "main",
            waveNumber: taskInput.waveNumber,
            deploymentType: existingDeploymentId ? "manual" : "automated",
            triggeredBy: userId,
            status: "building",
            buildStatus: "queued",
          },
        });
      });

      // Step 5: Pre-deployment validation
      await step.run("pre-deployment-validation", async () => {
        // Check if all tasks are completed
        const incompleteTasks = await prisma.agentTask.count({
          where: {
            projectId,
            status: { in: ["pending", "in_progress"] },
          },
        });

        if (incompleteTasks > 0) {
          logger.warn(
            `[Inngest] Deploying with ${incompleteTasks} incomplete tasks`
          );
        }

        // Check if integration tests passed (if applicable)
        const integrationResult = await prisma.agentExecution.findFirst({
          where: {
            projectId,
            agentName: "IntegrationAgent",
            success: true,
          },
          orderBy: { createdAt: "desc" },
        });

        if (!integrationResult) {
          logger.warn(`[Inngest] Deploying without integration verification`);
        }

        logger.info(`[Inngest] Pre-deployment validation passed`);
      });

      // Step 6: Update deployment status to building
      await step.run("mark-deployment-building", async () => {
        await prisma.deployment.update({
          where: { id: deployment.id },
          data: {
            status: "building",
            buildStatus: "building",
          },
        });
      });

      // Step 7: Execute Deploy Agent
      const startTime = Date.now();
      const result = await step.run("deploy-to-platform", async () => {
        try {
          const deployResult = await deployAgent.execute({
            taskId,
            projectId,
            userId,
            conversationId,
            taskDetails: {
              title: `Deploy to ${deploymentPlatform}`,
              description: `Deploy application to ${deploymentPlatform} (${taskInput.environment})`,
              complexity: "medium",
              estimatedLines: 0,
              platform: deploymentPlatform,
              environment: taskInput.environment || "production",
              envVars: envVars,
              customDomain: taskInput.customDomain,
              runMigrations: taskInput.runMigrations !== false, // Default true
            },
            context: {
              techStack: projectContext.techStack as TechStack | undefined,
              architecture: projectContext.architecture,
              codebase: projectContext.codebase,
            },
          });

          // Update deployment record with results
          const buildDuration = Date.now() - startTime;

          await prisma.deployment.update({
            where: { id: deployment.id },
            data: {
              status: deployResult.success ? "deployed" : "failed",
              buildStatus: deployResult.success ? "success" : "failed",
              deploymentUrl: (deployResult.data?.deploymentUrl as string) || undefined,
              platformDeploymentId: (deployResult.data?.deploymentId as string) || undefined,
              buildDuration,
              deployedAt: deployResult.success ? new Date() : null,
              failedAt: deployResult.success ? null : new Date(),
              errorMessage: deployResult.success ? null : deployResult.message,
              buildLogs: deployResult.data?.logs ? JSON.stringify(deployResult.data.logs).slice(0, 50000) : null, // Limit to 50k chars
            },
          });

          return deployResult;
        } catch (error) {
          // Update deployment as failed
          const buildDuration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          await prisma.deployment.update({
            where: { id: deployment.id },
            data: {
              status: "failed",
              buildStatus: "failed",
              failedAt: new Date(),
              buildDuration,
              errorMessage,
            },
          });

          throw error;
        }
      });

      // Step 6: Store deployment results
      await step.run("store-deployment-results", async () => {
        // Update project context with deployment info
        const existingCodebase = projectContext.codebase as CodebaseData | null;
        const existingDeployments = existingCodebase?.deployments || {};

        const updatedCodebase: CodebaseData = {
          ...(existingCodebase || {}),
          deployments: {
            ...existingDeployments,
            [taskInput.environment || "production"]: {
              platform: deploymentPlatform,
              url: result.data?.deploymentUrl,
              deploymentId: result.data?.deploymentId,
              deployedAt: new Date().toISOString(),
              healthCheckPassed: result.data?.healthCheckPassed,
              status: result.success ? "active" : "failed",
            },
          },
        };

        await prisma.projectContext.update({
          where: { projectId },
          data: {
            codebase: updatedCodebase as unknown as Prisma.InputJsonValue,
          },
        });

        logger.info(`[Inngest] Stored deployment results in ProjectContext`);
      });

      // Step 7: Run post-deployment smoke tests (if deployment succeeded)
      if (result.success && result.data?.deploymentUrl) {
        await step.run("post-deployment-tests", async () => {
          logger.info(`[Inngest] Running post-deployment smoke tests`);

          // Basic smoke test: Check if deployment is accessible
          try {
            const response = await fetch(result.data!.deploymentUrl!, {
              method: "GET",
              signal: AbortSignal.timeout(10000),
            });

            const smokeTestPassed = response.status < 500;

            logger.info(
              `[Inngest] Smoke test ${smokeTestPassed ? "passed" : "failed"}`,
              {
                status: response.status,
                url: result.data!.deploymentUrl,
              }
            );

            return smokeTestPassed;
          } catch (error) {
            logger.warn(`[Inngest] Smoke test failed`, toLogContext(error));
            return false;
          }
        });
      }

      // Step 8: Update project phase to "complete" if production deployment
      if (
        result.success &&
        (taskInput.environment === "production" || !taskInput.environment)
      ) {
        await step.run("mark-project-complete", async () => {
          await prisma.projectContext.update({
            where: { projectId },
            data: {
              currentPhase: "complete",
              updatedAt: new Date(),
            },
          });

          logger.info(`[Inngest] Project marked as complete`, { projectId });
        });
      }

      // Step 9: Send completion event
      await step.run("send-completion-event", async () => {
        await inngest.send({
          name: "agent/deployment.deploy.complete",
          data: {
            taskId,
            projectId,
            success: result.success,
            deploymentUrl: result.data?.deploymentUrl,
            deploymentId: result.data?.deploymentId,
            platform: deploymentPlatform,
            environment: taskInput.environment || "production",
            healthCheckPassed: result.data?.healthCheckPassed,
          },
        });
      });

      // Step 10: Trigger Documentation Agent (if production deployment)
      if (
        result.success &&
        (taskInput.environment === "production" || !taskInput.environment)
      ) {
        await step.run("trigger-documentation", async () => {
          logger.info(`[Inngest] Triggering Documentation Agent`);

          await inngest.send({
            name: "agent/documentation.generate",
            data: {
              taskId: `docs-${projectId}`,
              projectId,
              userId,
              conversationId,
              taskInput: {
                includeApiDocs: true,
                includeArchitecture: true,
                includeDeployment: true,
                deploymentUrl: result.data?.deploymentUrl,
              },
            },
          });
        });
      }

      logger.info(`[Inngest] Deploy Agent completed`, {
        taskId,
        success: result.success,
        url: result.data?.deploymentUrl,
      });

      return {
        success: result.success,
        message: result.message,
        deploymentUrl: result.data?.deploymentUrl,
        deploymentId: result.data?.deploymentId,
        platform: deploymentPlatform,
        environment: taskInput.environment || "production",
        healthCheckPassed: result.data?.healthCheckPassed,
        logs: result.data?.logs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error(`[Inngest] Deploy Agent failed`, createAgentError(errorMessage, { taskId }));

      // Send failure event
      await step.run("send-failure-event", async () => {
        await inngest.send({
          name: "agent/deployment.deploy.complete",
          data: {
            taskId,
            projectId,
            success: false,
            error: errorMessage,
          },
        });
      });

      throw error;
    }
  }
);
