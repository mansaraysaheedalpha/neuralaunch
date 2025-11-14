
// src/inngest/functions/fix-critical-issues-function.ts
/**
 * Fix Critical Issues Function
 * Handles auto-fixing of critical issues found by Critic Agent
 * Uses intelligent retry logic with escalation to humans when needed
 */

import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { toError, createAgentError } from "@/lib/error-utils";
import { sendNotification } from "@/lib/notifications/notification-service";

export const fixCriticalIssuesFunction = inngest.createFunction(
  {
    id: "fix-critical-issues",
    name: "Fix Critical Issues - Auto-Repair with Escalation",
    retries: 0, // We handle retries manually
    concurrency: {
      limit: 1,
      key: "event.data.projectId",
    },
  },
  { event: "agent/quality.fix-issues" },
  async ({ event, step }) => {
    const {
      projectId,
      userId,
      conversationId,
      waveNumber,
      criticResult,
    } = event.data;

    // Validate required fields
    if (!projectId || !waveNumber) {
      throw new Error("Missing required fields: projectId and waveNumber");
    }

    const log = logger.child({
      inngestFunction: "fixCriticalIssues",
      projectId,
      waveNumber,
    });

    log.info(`[Wave ${waveNumber}] Starting auto-fix workflow`, {
      criticResult: criticResult ? 'present' : 'missing',
    });

    try {
      // Step 1: Categorize issues by severity
      const issueCategories = await step.run("categorize-issues", async () => {
        const tasks = await prisma.agentTask.findMany({
          where: { projectId, waveNumber },
          select: {
            id: true,
            agentName: true,
            criticalIssues: true,
            reviewScore: true,
            output: true,
          },
        });

        // Get detailed review from ProjectContext
        const projectContext = await prisma.projectContext.findUnique({
          where: { projectId },
          select: { codebase: true },
        });

        const lastReview = (projectContext?.codebase as any)?.lastReview;

        // Categorize issues
        const critical = lastReview?.mustFix?.filter(
          (i: any) => i.severity === "critical"
        ) || [];
        const breaking = lastReview?.mustFix?.filter(
          (i: any) => 
            i.severity === "high" && 
            (i.category === "security" || i.category === "type_safety")
        ) || [];
        const medium = lastReview?.shouldFix || [];

        log.info(`[Wave ${waveNumber}] Issue breakdown`, {
          critical: critical.length,
          breaking: breaking.length,
          medium: medium.length,
        });

        return {
          critical,
          breaking,
          medium,
          tasks,
        };
      });

      // Step 2: Determine retry strategy based on severity
      const retryStrategy = await step.run("determine-retry-strategy", async () => {
        const hasCriticalOrBreaking =
          issueCategories.critical.length > 0 ||
          issueCategories.breaking.length > 0;

        const strategy = {
          maxAttempts: hasCriticalOrBreaking ? 5 : 3,
          issueType: hasCriticalOrBreaking ? "critical" : "medium",
          escalateOnFailure: hasCriticalOrBreaking,
          issues: hasCriticalOrBreaking
            ? [...issueCategories.critical, ...issueCategories.breaking]
            : issueCategories.medium,
        };

        log.info(`[Wave ${waveNumber}] Retry strategy determined`, strategy);

        return strategy;
      });

      // Step 3: Attempt fixes with retry loop
      let attempt = 0;
      let fixSuccessful = false;
      let lastError: string | null = null;

      while (attempt < retryStrategy.maxAttempts && !fixSuccessful) {
        attempt++;

        log.info(
          `[Wave ${waveNumber}] Fix attempt ${attempt}/${retryStrategy.maxAttempts}`
        );

        // Step 3.1: For each task with issues, trigger the originating agent to fix
        const fixResults = await step.run(
          `fix-attempt-${attempt}`,
          async () => {
            const results = [];

            for (const task of issueCategories.tasks) {
              if (!task.criticalIssues || task.criticalIssues === 0) {
                continue; // Skip tasks with no critical issues
              }

              log.info(
                `[Wave ${waveNumber}] Sending fix request to ${task.agentName}`,
                {
                  attempt,
                  taskId: task.id,
                }
              );

              // Get issues specific to this task
              const taskIssues = retryStrategy.issues.filter(
                (issue: any) =>
                  (task.output as any)?.filesCreated?.includes(issue.file)
              );

              if (taskIssues.length === 0) continue;

              // Trigger the agent to fix issues
              const agentEvent = getAgentEventName(task.agentName);

              await inngest.send({
                name: agentEvent as any,
                data: {
                  taskId: `${task.id}-fix-${attempt}`,
                  projectId,
                  userId,
                  conversationId,
                  taskInput: {
                    mode: "fix",
                    originalTaskId: task.id,
                    issuesToFix: taskIssues,
                    attempt,
                    waveNumber,
                  },
                  priority: 1,
                } as any,
              });

              results.push({
                taskId: task.id,
                agentName: task.agentName,
                issuesCount: taskIssues.length,
              });
            }

            return results;
          }
        );

        if (fixResults.length === 0) {
          log.warn(`[Wave ${waveNumber}] No tasks needed fixing`);
          fixSuccessful = true;
          break;
        }

        // Step 3.2: Wait for all agents to complete fixes
        const agentCompletions = await step.run(
          `wait-for-fixes-${attempt}`,
          async () => {
            // Wait for all agent completions
            const completions = [];

            for (const result of fixResults) {
              try {
                const eventName = getAgentCompleteEventName(result.agentName);
                const completion = await step.waitForEvent(
                  eventName as any,
                  {
                    event: eventName as any,
                    timeout: "15m",
                    match: `data.taskId`,
                  } as any
                );

                completions.push({
                  taskId: result.taskId,
                  success: (completion as any)?.data?.success ?? false,
                  agentName: result.agentName,
                });
              } catch (error) {
                log.error(
                  `[Wave ${waveNumber}] Agent ${result.agentName} timeout`,
                  toError(error)
                );
                completions.push({
                  taskId: result.taskId,
                  success: false,
                  agentName: result.agentName,
                  error: "Timeout waiting for agent",
                });
              }
            }

            return completions;
          }
        );

        // Step 3.3: Re-run Critic to verify fixes
        const verificationResult = await step.run(
          `verify-fixes-${attempt}`,
          async () => {
            log.info(`[Wave ${waveNumber}] Re-running critic for verification`);

            // Get updated files
            const updatedTasks = await prisma.agentTask.findMany({
              where: { projectId, waveNumber },
              select: { output: true },
            });

            const filesCreated = updatedTasks.flatMap(
              (task) => (task.output as any)?.filesCreated || []
            );

            // Trigger critic
            await inngest.send({
              name: "agent/quality.critic",
              data: {
                taskId: `wave-${waveNumber}-review-attempt-${attempt}`,
                projectId,
                userId,
                conversationId,
                taskInput: {
                  filesToReview: filesCreated,
                  reviewType: "full",
                  strictMode: false,
                  waveNumber,
                },
              },
            });

            // Wait for result
            const criticResult = await step.waitForEvent(
              "agent/quality.critic.complete",
              {
                event: "agent/quality.critic.complete",
                timeout: "10m",
                match: "data.taskId",
              }
            );

            return criticResult?.data ?? null;
          }
        );

        // Step 3.4: Check if fixes were successful
        if (verificationResult && verificationResult.approved && verificationResult.success) {
          log.info(
            `[Wave ${waveNumber}] Fixes successful on attempt ${attempt}!`,
            {
              score: verificationResult.score,
            }
          );
          fixSuccessful = true;

          // Update wave status
          await prisma.executionWave.update({
            where: { projectId_waveNumber: { projectId, waveNumber } },
            data: {
              status: "completed",
            },
          });
        } else {
          lastError = `Critic still found issues after attempt ${attempt}. Score: ${verificationResult?.score ?? 'N/A'}`;
          log.warn(`[Wave ${waveNumber}] ${lastError}`);

          // Check if we should continue trying
          if (attempt >= retryStrategy.maxAttempts) {
            log.error(
              `[Wave ${waveNumber}] Max retries reached, fixes unsuccessful`
            );
            break;
          }

          // Wait before next attempt (exponential backoff)
          const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
          log.info(
            `[Wave ${waveNumber}] Waiting ${waitTime}ms before next attempt`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }

      // Step 4: Handle final result
      if (!fixSuccessful) {
        log.error(
          `[Wave ${waveNumber}] Auto-fix failed after ${attempt} attempts`
        );

        // Check if we should escalate to human
        if (retryStrategy.escalateOnFailure) {
          log.info(
            `[Wave ${waveNumber}] Escalating to human review (critical issues)`
          );

          // Update wave status
          await prisma.executionWave.update({
            where: { projectId_waveNumber: { projectId, waveNumber } },
            data: {
              status: "needs_human_review",
            },
          });

          // Store escalation details
          await prisma.projectContext.update({
            where: { projectId },
            data: {
              codebase: {
                ...(await prisma.projectContext
                  .findUnique({ where: { projectId } })
                  .then((p) => (p?.codebase as any) || {})),
                escalation: {
                  waveNumber,
                  reason: "critical_issues_unfixed",
                  attempts: attempt,
                  lastError,
                  timestamp: new Date().toISOString(),
                  issues: retryStrategy.issues.slice(0, 10), // Store first 10 issues
                },
              } as any,
            },
          });

          // Send escalation notification to user
          try {
            await sendNotification({
              userId,
              projectId,
              type: "escalation",
              priority: "critical",
              title: `Wave ${waveNumber} Escalated`,
              message: `Critical issues remain after ${attempt} fix attempts`,
              escalationReason: `${retryStrategy.issues.length} critical issue${retryStrategy.issues.length > 1 ? 's' : ''} could not be auto-fixed`,
              attempts: attempt,
            });
            log.info(`[Wave ${waveNumber}] Escalation notification sent to user`);
          } catch (notifError) {
            log.error(`[Wave ${waveNumber}] Failed to send escalation notification`, toError(notifError));
          }

          // Create CriticalFailure record for UI tracking
          try {
            await prisma.criticalFailure.create({
              data: {
                projectId,
                userId,
                waveNumber,
                phase: "quality-check",
                component: `Wave ${waveNumber}`,
                title: `Wave ${waveNumber} Critical Issues`,
                description: `${retryStrategy.issues.length} critical issues could not be auto-fixed after ${attempt} attempts`,
                errorMessage: lastError,
                rootCause: retryStrategy.issues.length > 0 ? retryStrategy.issues[0].message : undefined,
                severity: "critical",
                issuesFound: retryStrategy.issues,
                issuesRemaining: retryStrategy.issues,
                totalAttempts: attempt,
                lastAttemptAt: new Date(),
                attemptHistory: fixHistory || [],
                status: "open",
                escalatedToHuman: true,
                escalatedAt: new Date(),
                notificationSent: true,
                notificationSentAt: new Date(),
                context: {
                  conversationId,
                  retryStrategy: retryStrategy.strategy,
                },
              },
            });
            log.info(`[Wave ${waveNumber}] CriticalFailure record created for UI tracking`);
          } catch (dbError) {
            log.error(`[Wave ${waveNumber}] Failed to create CriticalFailure record`, toError(dbError));
          }
        } else {
          // Medium issues - proceed with warnings
          log.warn(
            `[Wave ${waveNumber}] Proceeding despite unfixed medium issues`
          );

          await prisma.executionWave.update({
            where: { projectId_waveNumber: { projectId, waveNumber } },
            data: {
              status: "completed_with_warnings",
            },
          });
        }

        // Send completion event
        await inngest.send({
          name: "agent/quality.fix-issues.complete",
          data: {
            projectId,
            waveNumber,
            success: false,
            attempts: attempt,
            escalated: retryStrategy.escalateOnFailure,
            lastError,
          },
        });

        return {
          success: false,
          attempts: attempt,
          escalated: retryStrategy.escalateOnFailure,
          message: retryStrategy.escalateOnFailure
            ? "Critical issues require human review"
            : "Proceeding with warnings",
        };
      }

      // Success case
      log.info(
        `[Wave ${waveNumber}] Auto-fix completed successfully after ${attempt} attempt(s)`
      );

      // Send completion event
      await inngest.send({
        name: "agent/quality.fix-issues.complete",
        data: {
          projectId,
          waveNumber,
          success: true,
          attempts: attempt,
          escalated: false,
        },
      });

      return {
        success: true,
        attempts: attempt,
        message: `All issues fixed successfully after ${attempt} attempt(s)`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.error(`[Wave ${waveNumber}] Auto-fix workflow failed`, toError(error));

      // Send failure event
      await inngest.send({
        name: "agent/quality.fix-issues.complete",
        data: {
          projectId,
          waveNumber,
          success: false,
          attempts: 0,
          escalated: true,
          error: errorMessage,
        },
      });

      throw error;
    }
  }
);

// Helper utility functions
function getAgentEventName(agentName: string): string {
  const eventMap: Record<string, string> = {
    BackendAgent: "agent/execution.backend",
    FrontendAgent: "agent/execution.frontend",
    InfrastructureAgent: "agent/execution.infrastructure",
  };

  return eventMap[agentName] || "agent/execution.generic";
}

function getAgentCompleteEventName(agentName: string): string {
  const eventMap: Record<string, string> = {
    BackendAgent: "agent/execution.backend.complete",
    FrontendAgent: "agent/execution.frontend.complete",
    InfrastructureAgent: "agent/execution.infrastructure.complete",
  };

  return eventMap[agentName] || "agent/execution.generic.complete";
}