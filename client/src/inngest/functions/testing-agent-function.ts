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
    // Define a type for event data
    type TestingAgentEventData = {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId?: string;
      taskInput: {
        testType?: string;
        sourceFiles?: string[];
        waveNumber?: number;
        [key: string]: unknown;
      };
    };

    // Ensure event.data is an object with required properties before destructuring
    if (
      typeof event.data !== "object" ||
      event.data === null ||
      typeof (event.data as TestingAgentEventData).taskId !== "string" ||
      typeof (event.data as TestingAgentEventData).projectId !== "string" ||
      typeof (event.data as TestingAgentEventData).userId !== "string" ||
      typeof (event.data as TestingAgentEventData).taskInput !== "object"
    ) {
      throw new Error(
        "event.data is missing required properties or is not a valid object"
      );
    }
    const { taskId, projectId, userId, conversationId, taskInput } =
      event.data as TestingAgentEventData;

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

    // Step 1.5: Gather source files from completed tasks in the wave
    const sourceFilesToTest = await step.run("gather-source-files", async () => {
      // If sourceFiles explicitly provided, use them
      if (taskInput.sourceFiles && Array.isArray(taskInput.sourceFiles) && taskInput.sourceFiles.length > 0) {
        return taskInput.sourceFiles;
      }

      // Otherwise, gather files created by completed execution tasks in this wave
      const waveNumber = taskInput.waveNumber;
      if (!waveNumber) {
        logger.warn("[Testing Agent] No wave number provided, cannot gather source files");
        return [];
      }

      const completedTasks = await prisma.agentTask.findMany({
        where: {
          projectId,
          waveNumber,
          status: "completed",
          agentName: { in: ["FrontendAgent", "BackendAgent", "DatabaseAgent"] },
        },
        select: { output: true },
      });

      const files: string[] = [];
      completedTasks.forEach(task => {
        const output = task.output as { filesCreated?: Array<{ path: string }> | string[] } | null;
        if (output?.filesCreated && Array.isArray(output.filesCreated)) {
          output.filesCreated.forEach(file => {
            if (typeof file === "string") {
              files.push(file);
            } else if (file && typeof file === "object" && "path" in file && typeof file.path === "string") {
              files.push(file.path);
            }
          });
        }
      });

      logger.info("[Testing Agent] Gathered source files from completed tasks", { count: files.length });
      return files;
    });

    // Step 2: Execute Testing Agent
    const result = await step.run("generate-and-run-tests", async () => {
      return await testingAgent.execute({
        taskId,
        projectId,
        userId,
        conversationId:
          typeof conversationId === "string" ? conversationId : "",
        taskDetails: {
          title: "Generate Tests",
          description: sourceFilesToTest.length > 0
            ? `Generate tests for ${sourceFilesToTest.length} source files`
            : "Automated test generation (discover source files automatically)",
          complexity: "simple",
          estimatedLines: 100,
          testType: taskInput.testType || "unit",
          sourceFiles: sourceFilesToTest,
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
              testsPassed:
                (result.data as { testResults?: { passed?: number } })
                  ?.testResults?.passed || 0,
              testsFailed:
                (result.data as { testResults?: { failed?: number } })
                  ?.testResults?.failed || 0,
            },
          },
        });
      }
    });

    // Step 4: Handle test failures
    if (
      !result.success &&
      result.data &&
      (result.data as { testResults?: { failed?: number } })?.testResults
        ?.failed &&
      ((result.data as { testResults?: { failed?: number } })?.testResults
        ?.failed ?? 0) > 0
    ) {
      await step.run("handle-test-failures", async () => {
        const testData = result.data as
          | {
              testResults?: {
                failed?: number;
                failures?: Array<{ file: string }>;
              };
            }
          | undefined;
        logger.warn(`[Inngest] Tests failed, analyzing failures`, {
          taskId,
          failedCount: testData?.testResults?.failed,
        });

        // Get the original agent that wrote the failing code
        const failedFiles = testData?.testResults?.failures?.map(
          (f: { file: string }) => f.file
        );

        // Find which tasks created these files
        const tasksToFix = await prisma.agentTask.findMany({
          where: {
            projectId,
            status: "completed",
            waveNumber: taskInput.waveNumber,
          },
        });

        // Define the expected shape of agentTask.output
        interface AgentTaskOutput {
          filesCreated?: string[];
          [key: string]: unknown;
        }

        for (const task of tasksToFix) {
          const taskOutput: AgentTaskOutput = task.output as AgentTaskOutput;
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
                  ...(typeof task.input === "object" && task.input !== null
                    ? (task.input as Record<string, unknown>)
                    : {}),
                  _testFailures: testData?.testResults?.failures,
                  _retryReason: "test_failures",
                },
              },
            });

            // Re-trigger the execution agent
            // Use the expected literal type for the event name
            await inngest.send({
              name: "agent/execute.step.requested",
              data: {
                taskId: task.id,
                projectId,
                userId,
                stepIndex: 0,
                taskDescription: `Fix test failures for ${task.agentName}`,
                blueprintSummary: "Retry after test failures",
                userResponses: null,
                githubToken: null,
                githubRepoUrl: null,
                currentHistoryLength: 0,
              },
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
          testsPassed:
            (result.data as { testResults?: { passed?: number } })?.testResults
              ?.passed || 0,
          testsFailed:
            (result.data as { testResults?: { failed?: number } })?.testResults
              ?.failed || 0,
        },
      });
    });

    const testData = result.data as {
      testsGenerated?: number;
      testResults?: { passed?: number; failed?: number };
    };
    logger.info(`[Inngest] Testing Agent completed`, {
      taskId,
      success: result.success,
      testsGenerated: testData?.testsGenerated,
    });

    return {
      success: result.success,
      message: result.message,
      testsGenerated: testData?.testsGenerated,
      testsPassed: testData?.testResults?.passed,
      testsFailed: testData?.testResults?.failed,
    };
  }
);
