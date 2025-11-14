// src/inngest/functions/testing-agent-function.ts
/**
 * Testing Agent Inngest Function
 * Triggered after execution agents complete their tasks
 * Generates and runs tests for the created code
 */

import { inngest } from "../client";
import { testingAgent } from "@/lib/agents/quality/testing-agent";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { TechStack } from "@/lib/agents/types/common";

export const testingAgentFunction = inngest.createFunction(
  {
    id: "testing-agent-execution",
    name: "Testing Agent - Generate and Run Tests",
    retries: 2,
  },
  { event: "agent/quality.testing" },
  async ({ event, step }) => {
    const { taskId, projectId, userId, conversationId, taskInput } = event.data;

    logger.info(`[Inngest] Testing Agent triggered`, {
      taskId,
      projectId,
      testType: taskInput.testType || "unit",
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

    // Step 2: Execute Testing Agent
    const result = await step.run("generate-and-run-tests", async () => {
      return await testingAgent.execute({
        taskId,
        projectId,
        userId,
        conversationId,
        taskDetails: {
          title: "Generate Tests",
          description: "Automated test generation",
          complexity: "simple",
          estimatedLines: 100,
          testType: taskInput.testType || "unit",
          sourceFiles: taskInput.sourceFiles || [],
        },
        context: {
          techStack: projectContext.techStack as TechStack | undefined,
          architecture: projectContext.architecture,
        },
      });
    });

    // Step 3: Store results
    await step.run("store-test-results", async () => {
      // Store test results in wave tasks if this is part of a wave
      if (taskInput.waveNumber) {
        await prisma.agentTask.updateMany({
          where: {
            projectId,
            waveNumber: taskInput.waveNumber,
          },
          data: {
            output: {
              ...result.data,
              testsPassed: result.data?.testResults?.passed || 0,
              testsFailed: result.data?.testResults?.failed || 0,
            } as any,
          },
        });
      }
    });

    // Step 4: Handle test failures
    if (!result.success && result.data?.testResults?.failed > 0) {
      await step.run("handle-test-failures", async () => {
        logger.warn(`[Inngest] Tests failed, analyzing failures`, {
          taskId,
          failedCount: result.data.testResults.failed,
        });

        // Get the original agent that wrote the failing code
        const failedFiles = result.data.testResults.failures?.map(
          (f: any) => f.file
        );

        // Find which tasks created these files
        const tasksToFix = await prisma.agentTask.findMany({
          where: {
            projectId,
            status: "completed",
            waveNumber: taskInput.waveNumber,
          },
        });

        for (const task of tasksToFix) {
          const taskOutput = task.output as any;
          const filesCreated = taskOutput?.filesCreated || [];

          // Check if this task created any of the failing files
          const hasFailingFiles = filesCreated.some((file: string) =>
            failedFiles?.includes(file)
          );

          if (hasFailingFiles) {
            logger.info(
              `[Inngest] Re-triggering ${task.agentName} to fix failures`
            );

            // Reset task to pending and add failure context
            await prisma.agentTask.update({
              where: { id: task.id },
              data: {
                status: "pending",
                input: {
                  ...(typeof task.input === 'object' && task.input !== null ? task.input : {}),
                  _testFailures: result.data.testResults.failures,
                  _retryReason: "test_failures",
                } as any,
              },
            });

            // Re-trigger the execution agent
            const eventName = `agent/execution.${task.agentName.toLowerCase().replace("agent", "")}`;

            await inngest.send({
              name: eventName as any,
              data: {
                taskId: task.id,
                projectId,
                userId,
                conversationId: conversationId || undefined,
                taskInput: task.input,
                waveNumber: taskInput.waveNumber,
              } as any,
            });
          }
        }
      });
    }

    // Step 5: Send completion event (for wave-complete to listen)
    await step.run("send-completion-event", async () => {
      await inngest.send({
        name: "agent/quality.testing.complete",
        data: {
          taskId,
          projectId,
          waveNumber: taskInput.waveNumber,
          success: result.success,
          testsPassed: result.data?.testResults?.passed || 0,
          testsFailed: result.data?.testResults?.failed || 0,
        },
      });
    });

    logger.info(`[Inngest] Testing Agent completed`, {
      taskId,
      success: result.success,
      testsGenerated: result.data?.testsGenerated,
    });

    return {
      success: result.success,
      message: result.message,
      testsGenerated: result.data?.testsGenerated,
      testsPassed: result.data?.testResults?.passed,
      testsFailed: result.data?.testResults?.failed,
    };
  }
);
