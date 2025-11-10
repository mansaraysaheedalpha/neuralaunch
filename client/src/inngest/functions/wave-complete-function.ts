// src/inngest/functions/wave-complete-function.ts
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

export const waveCompleteFunction = inngest.createFunction(
  {
    id: "wave-complete-handler",
    name: "Wave Complete - Triage Center with Preview Deployment",
    retries: 2,
  },
  { event: "agent/wave.complete" },
  async ({ event, step }) => {
    const { projectId, userId, conversationId, waveNumber } = event.data;

    const log = logger.child({
      inngestFunction: "waveComplete",
      projectId,
      waveNumber,
    });

    log.info(
      `[Wave ${waveNumber}] Wave execution complete, starting quality checks`
    );

    try {
      // ==========================================
      // STEP 1: TESTING AGENT
      // ==========================================
      const testingResult = await step.run(
        "trigger-testing-agent",
        async () => {
          const waveTasks = await prisma.agentTask.findMany({
            where: { projectId, waveNumber, status: "completed" },
            select: { output: true },
          });

          const filesCreated = waveTasks.flatMap(
            (task) => (task.output as any)?.filesCreated || []
          );

          log.info(
            `[Wave ${waveNumber}] Running tests on ${filesCreated.length} files`
          );

          await inngest.send({
            name: "agent/quality.testing",
            data: {
              taskId: `wave-${waveNumber}-testing`,
              projectId,
              userId,
              conversationId,
              taskInput: {
                testType: "unit",
                sourceFiles: filesCreated,
                waveNumber,
              },
            },
          });

          return { filesCreated };
        }
      );

      await step.waitForEvent("agent/quality.testing.complete", {
        event: "agent/quality.testing.complete",
        timeout: "10m",
        match: "data.taskId",
      });

      // ==========================================
      // STEP 2: CRITIC AGENT (Initial Review)
      // ==========================================
      await step.run("trigger-critic-agent", async () => {
        log.info(`[Wave ${waveNumber}] Running code review`);

        await inngest.send({
          name: "agent/quality.critic",
          data: {
            taskId: `wave-${waveNumber}-review`,
            projectId,
            userId,
            conversationId,
            taskInput: {
              filesToReview: testingResult.filesCreated,
              reviewType: "full",
              strictMode: false,
              waveNumber,
            },
          },
        });
      });

      const criticResult = await step.waitForEvent(
        "agent/quality.critic.complete",
        {
          event: "agent/quality.critic.complete",
          timeout: "10m",
          match: "data.taskId",
        }
      );

      // Validate critic result
      if (!criticResult.data || typeof criticResult.data.approved === 'undefined') {
        throw new Error("Invalid critic result: missing 'approved' field");
      }

      log.info(`[Wave ${waveNumber}] Critic review complete`, {
        approved: criticResult.data.approved,
        score: criticResult.data.score,
      });

      // ==========================================
      // STEP 3: TRIAGE - Route Based on Critic Result
      // ==========================================
      let shouldProceedToIntegration = false;
      let reviewScore = criticResult.data.score || 0;
      let hasWarnings = false;

      if (criticResult.data.approved) {
        log.info(`[Wave ${waveNumber}] Code review approved, proceeding`);
        shouldProceedToIntegration = true;
      } else {
        log.warn(
          `[Wave ${waveNumber}] Code review failed, triggering auto-fix`
        );

        await step.run("trigger-auto-fix", async () => {
          await inngest.send({
            name: "agent/quality.fix-issues",
            data: {
              projectId,
              userId,
              conversationId,
              waveNumber,
              criticResult: criticResult.data,
            },
          });
        });

        const fixCompleteResult = await step.waitForEvent(
          "agent/quality.fix-issues.complete",
          {
            event: "agent/quality.fix-issues.complete",
            timeout: "40m",
            match: "data.waveNumber",
          }
        );

        log.info(`[Wave ${waveNumber}] Auto-fix completed`, {
          success: fixCompleteResult.data.success,
          escalated: fixCompleteResult.data.escalated,
          attempts: fixCompleteResult.data.attempts,
        });

        if (fixCompleteResult.data.success) {
          log.info(`[Wave ${waveNumber}] Issues fixed successfully`);
          shouldProceedToIntegration = true;
          reviewScore = fixCompleteResult.data.finalScore || reviewScore;
        } else if (fixCompleteResult.data.escalated) {
          log.warn(`[Wave ${waveNumber}] Escalated to human review, stopping`);

          return {
            success: false,
            waveNumber,
            needsHumanReview: true,
            message: `Wave ${waveNumber} requires human review`,
            criticScore: reviewScore,
            escalationReason: fixCompleteResult.data.escalationReason,
          };
        } else {
          log.warn(
            `[Wave ${waveNumber}] Proceeding with warnings (medium issues unfixed)`
          );
          shouldProceedToIntegration = true;
          hasWarnings = true;
        }
      }

      // ==========================================
      // STEP 4: INTEGRATION AGENT
      // ==========================================
      if (!shouldProceedToIntegration) {
        throw new Error("Logic error: shouldProceedToIntegration is false");
      }

      await step.run("trigger-integration-agent", async () => {
        log.info(`[Wave ${waveNumber}] Running integration verification`);

        await inngest.send({
          name: "agent/quality.integration",
          data: {
            taskId: `wave-${waveNumber}-integration`,
            projectId,
            userId,
            conversationId,
            taskInput: {
              verificationType: "full",
              waveNumber,
            },
          },
        });
      });

      const integrationResult = await step.waitForEvent(
        "agent/quality.integration.complete",
        {
          event: "agent/quality.integration.complete",
          timeout: "10m",
          match: "data.taskId",
        }
      );

      const integrationPassed = await step.run(
        "verify-integration",
        async () => {
          const { compatible, compatibilityScore, criticalIssues } =
            integrationResult.data;

          if (!compatible || criticalIssues > 0) {
            log.warn(`[Wave ${waveNumber}] Integration failed`, {
              compatibilityScore,
              criticalIssues,
            });

            await prisma.executionWave.update({
              where: { projectId_waveNumber: { projectId, waveNumber } },
              data: { status: "failed" },
            });

            return false;
          }

          log.info(
            `[Wave ${waveNumber}] Integration verified! Score: ${compatibilityScore}/100`
          );
          return true;
        }
      );

      if (!integrationPassed) {
        throw new Error("Integration verification failed");
      }

      // ==========================================
      // ✅ STEP 5: DEPLOY PREVIEW (NEW!)
      // ==========================================
      const previewDeployment = await step.run(
        "trigger-preview-deployment",
        async () => {
          log.info(`[Wave ${waveNumber}] Deploying preview for UAT`);

          // Get deployment platform from project architecture
          const projectContext = await prisma.projectContext.findUnique({
            where: { projectId },
            select: { architecture: true },
          });

          const architecture = projectContext?.architecture as any;
          const platform =
            architecture?.infrastructureArchitecture?.hosting?.toLowerCase() ||
            "vercel";

          await inngest.send({
            name: "agent/deployment.deploy",
            data: {
              taskId: `deploy-wave-${waveNumber}-preview`,
              projectId,
              userId,
              conversationId,
              taskInput: {
                platform,
                environment: "preview", // 🔥 PREVIEW, not production
                runMigrations: false, // Don't run migrations on preview
                previewBranch: `wave-${waveNumber}`, // Deploy from wave branch
              },
            },
          });

          return { platform };
        }
      );

      // ✅ Wait for preview deployment to complete
      const deploymentResult = await step.waitForEvent(
        "agent/deployment.deploy.complete",
        {
          event: "agent/deployment.deploy.complete",
          timeout: "15m",
          match: "data.taskId",
        }
      );

      const previewUrl = await step.run("capture-preview-url", async () => {
        if (!deploymentResult.data.success) {
          log.warn(
            `[Wave ${waveNumber}] Preview deployment failed, continuing without URL`
          );
          return null;
        }

        const url = deploymentResult.data.deploymentUrl;
        log.info(`[Wave ${waveNumber}] Preview deployed: ${url}`);

        // Store preview URL in wave
        await prisma.executionWave.update({
          where: { projectId_waveNumber: { projectId, waveNumber } },
          data: {
            previewUrl: url, // ✅ NEW FIELD (add to schema)
            previewDeployedAt: new Date(),
          },
        });

        return url;
      });

      // ==========================================
      // STEP 6: GITHUB PR CREATION (with preview URL)
      // ==========================================
      const prResult = await step.run("create-github-pr", async () => {
        log.info(`[Wave ${waveNumber}] Creating GitHub PR`);

        const waveTasks = await prisma.agentTask.findMany({
          where: { projectId, waveNumber },
          select: { branchName: true, agentName: true },
        });

        const branches = waveTasks
          .map((t) => t.branchName)
          .filter((b): b is string => !!b);

        if (branches.length === 0) {
          throw new Error("No branches found for PR creation");
        }

        const mainBranch = branches[0];

        const projectContext = await prisma.projectContext.findUnique({
          where: { projectId },
          select: { codebase: true },
        });

        const codebase = projectContext?.codebase as any;
        const repoName = codebase?.githubRepoName;

        if (!repoName) {
          throw new Error("GitHub repo not configured");
        }

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

        if (!githubToken) {
          throw new Error("GitHub token not found");
        }

        const { githubAgent } = await import(
          "@/lib/agents/github/github-agent"
        );

        // ✅ Build PR description with preview URL
        const prDescription = `
## Wave ${waveNumber} Changes

**Review Score:** ${reviewScore}/100
**Status:** ${hasWarnings ? "⚠️ Completed with warnings" : "✅ All checks passed"}

### Tasks Completed:
${waveTasks.map((t) => `- ${t.agentName}`).join("\n")}

${hasWarnings ? "\n⚠️ **Warning:** Some medium-priority issues remain unfixed. Review recommended." : ""}

### 🚀 Preview Deployment

${
  previewUrl
    ? `
**Preview URL:** ${previewUrl}

Test the changes live before approving this PR. The preview includes all code from Wave ${waveNumber}.

**Testing Checklist:**
- [ ] All new features work as expected
- [ ] No breaking changes to existing functionality
- [ ] UI/UX is acceptable
- [ ] Performance is acceptable
`
    : "⚠️ Preview deployment failed. Manual testing required."
}

---

**Auto-generated by NeuraLaunch Agent System**
        `;

        const prResult = await githubAgent.createPR({
          projectId,
          repoName,
          branchName: mainBranch,
          title: `Wave ${waveNumber} - Feature Implementation${hasWarnings ? " ⚠️" : ""}`,
          description: prDescription,
          githubToken,
        });

        if (!prResult.success) {
          throw new Error(`Failed to create PR: ${prResult.message}`);
        }

        await prisma.agentTask.updateMany({
          where: { projectId, waveNumber },
          data: {
            prNumber: prResult.prNumber,
            prUrl: prResult.prUrl,
            reviewStatus: "pending",
          },
        });

        return {
          prUrl: prResult.prUrl,
          prNumber: prResult.prNumber,
        };
      });

      // ==========================================
      // STEP 7: MARK WAVE COMPLETE
      // ==========================================
      await step.run("mark-wave-complete", async () => {
        await prisma.executionWave.update({
          where: { projectId_waveNumber: { projectId, waveNumber } },
          data: {
            status: hasWarnings ? "completed_with_warnings" : "completed",
            completedAt: new Date(),
            finalReviewScore: reviewScore,
          },
        });
      });

      // ==========================================
      // STEP 8: CHECK FOR MORE WAVES
      // ==========================================
      const hasMoreTasks = await step.run("check-more-waves", async () => {
        const pendingCount = await prisma.agentTask.count({
          where: { projectId, status: "pending", waveNumber: null },
        });
        return pendingCount > 0;
      });

      return {
        success: true,
        waveNumber,
        prUrl: prResult.prUrl,
        prNumber: prResult.prNumber,
        previewUrl, // ✅ Include preview URL in response
        hasMoreWaves: hasMoreTasks,
        criticScore: reviewScore,
        hasWarnings,
        message: `Wave ${waveNumber} complete! Preview: ${previewUrl || "N/A"}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.error(`[Wave ${waveNumber}] Wave completion failed`, {
        error: errorMessage,
      });
      throw error;
    }
  }
);
