// src/inngest/functions/critic-agent-function.ts
/**
 * Critic Agent Inngest Function
 * Triggered after Testing Agent completes to review code quality
 */

import { inngest } from "../client";
import { criticAgent } from "@/lib/agents/quality/critic-agent";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { githubAgent } from "@/lib/agents/github/github-agent";

export const criticAgentFunction = inngest.createFunction(
  {
    id: "critic-agent-review",
    name: "Critic Agent - Code Review & Quality Gate",
    retries: 2,
  },
  { event: "agent/quality.critic" },
  async ({ event, step }) => {
    const { taskId, projectId, userId, conversationId, taskInput } = event.data;

    logger.info(`[Inngest] Critic Agent triggered`, {
      taskId,
      projectId,
      reviewType: taskInput.reviewType || "full",
    });

    // Step 1: Get files to review
    const filesToReview = await step.run("get-files-to-review", async () => {
      return taskInput.filesToReview || [];
    });

    if (filesToReview.length === 0) {
      logger.warn(`[Inngest] No files to review for task ${taskId}`);

      // Send completion event anyway
      await inngest.send({
        name: "agent/quality.critic.complete",
        data: {
          taskId,
          projectId,
          waveNumber: taskInput.waveNumber ?? 0,
          success: true,
          approved: true,
        },
      });

      return {
        success: true,
        message: "No files to review",
      };
    }

    // Step 2: Get project context
    const projectContext = await step.run("get-project-context", async () => {
      return await prisma.projectContext.findUnique({
        where: { projectId },
        select: { techStack: true, architecture: true },
      });
    });

    if (!projectContext) {
      throw new Error(`Project context not found for ${projectId}`);
    }

    // Step 3: Execute Critic Agent
    const result = await step.run("perform-code-review", async () => {
      return await criticAgent.execute({
        taskId: taskId!,
        projectId,
        userId: userId!,
        conversationId: conversationId!,
        taskDetails: {
          title: "Code Review",
          description: "Automated code quality and security review",
          complexity: "simple",
          estimatedLines: 0,
          filesToReview,
          reviewType: taskInput.reviewType || "full",
          strictMode: taskInput.strictMode || false,
        },
        context: {
          techStack: projectContext.techStack,
          architecture: projectContext.architecture,
        },
      });
    });

    // Step 4: Post review to GitHub PR (if available)
    if (taskInput.waveNumber && result.data?.report) {
      await step.run("post-review-to-github", async () => {
        // Get PR info
        const tasks = await prisma.agentTask.findFirst({
          where: {
            projectId,
            waveNumber: taskInput.waveNumber,
            prNumber: { not: null },
          },
          select: { prNumber: true },
        });

        if (tasks?.prNumber) {
          // Get GitHub info
          const projectCtx = await prisma.projectContext.findUnique({
            where: { projectId },
            select: { codebase: true },
          });

          const codebase = projectCtx?.codebase as any;
          const repoName = codebase?.githubRepoName;

          if (repoName) {
            // Get GitHub token
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: {
                accounts: {
                  where: { provider: "github" },
                  select: { access_token: true },
                },
              },
            });

            const githubToken = user?.accounts[0]?.access_token;

            if (githubToken) {
              const report = result.data.report;

              // Format review comment
              const comment = `
## 🤖 Code Review - Wave ${taskInput.waveNumber}

**Overall Score:** ${report.overallScore}/100

### Metrics
- Code Quality: ${report.metrics.codeQualityScore}/100
- Security: ${report.metrics.securityScore}/100
- Performance: ${report.metrics.performanceScore}/100
- Maintainability: ${report.metrics.maintainabilityScore}/100

### Issues Found
- Critical: ${report.mustFix.length}
- Medium: ${report.shouldFix.length}
- Low: ${report.optional.length}

${
  report.mustFix.length > 0
    ? `### ⚠️ Must Fix:\n${report.mustFix
        .slice(0, 5)
        .map((i: any) => `- **${i.file}:${i.line}** - ${i.message}`)
        .join("\n")}`
    : ""
}

${report.approved ? "✅ **Code review passed!**" : "❌ **Code review failed - please address critical issues**"}
              `;

              await githubAgent.commentOnPR(
                repoName,
                tasks.prNumber,
                comment,
                githubToken
              );

              logger.info(`[Inngest] Posted review to PR #${tasks.prNumber}`);
            }
          }
        }
      });
    }

    // Step 5: Update task status
    await step.run("update-task-status", async () => {
      if (taskInput.waveNumber) {
        await prisma.agentTask.updateMany({
          where: {
            projectId,
            waveNumber: taskInput.waveNumber,
          },
          data: {
            reviewScore: result.data?.report?.overallScore,
            reviewApproved: result.data?.approved,
            criticalIssues: result.data?.report?.mustFix?.length || 0,
            securityScore: result.data?.report?.metrics?.securityScore,
          },
        });
      }
    });

    // Step 6: Send completion event
    await step.run("send-completion-event", async () => {
      await inngest.send({
        name: "agent/quality.critic.complete",
        data: {
          taskId,
          projectId,
          waveNumber: taskInput.waveNumber ?? 0,
          success: result.success,
          approved: result.data?.approved,
          score: result.data?.report?.overallScore,
        },
      });
    });

    logger.info(`[Inngest] Critic Agent completed`, {
      taskId,
      approved: result.data?.approved,
      score: result.data?.report?.overallScore,
    });

    return {
      success: result.success,
      message: result.message,
      approved: result.data?.approved,
      score: result.data?.report?.overallScore,
      criticalIssues: result.data?.report?.mustFix?.length || 0,
    };
  }
);
