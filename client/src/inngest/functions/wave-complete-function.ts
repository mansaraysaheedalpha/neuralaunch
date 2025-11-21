// src/inngest/functions/wave-complete-function.ts
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { toError } from "@/lib/error-utils";

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

          const filesCreated = waveTasks.flatMap((task) => {
            const output = task.output as { filesCreated?: unknown[] } | null;
            return Array.isArray(output?.filesCreated) ? output.filesCreated : [];
          });

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

      // Validate critic result and provide safe defaults
      const criticApproved = criticResult?.data?.approved ?? false;
      const criticScore = criticResult?.data?.score ?? 0;

      if (!criticResult || !criticResult.data || typeof criticResult.data.approved === 'undefined') {
        log.warn(`[Wave ${waveNumber}] Invalid critic result, defaulting to not approved`, {
          criticResultExists: !!criticResult,
          dataExists: !!criticResult?.data,
          approvedType: typeof criticResult?.data?.approved,
        });
      }

      log.info(`[Wave ${waveNumber}] Critic review complete`, {
        approved: criticApproved,
        score: criticScore,
      });

      // ==========================================
      // STEP 3: TRIAGE - Route Based on Critic Result
      // ==========================================
      let shouldProceedToIntegration = false;
      let reviewScore = criticScore;
      let hasWarnings = false;

      if (criticApproved) {
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
              issues: criticResult?.data?.issues || [],
              attempt: 1,
              criticResult: criticResult?.data,
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

        if (!fixCompleteResult || !fixCompleteResult.data) {
          throw new Error("Invalid fix complete result");
        }

        const fixData = fixCompleteResult.data as {
          success?: boolean;
          escalated?: boolean;
          attempts?: number;
          finalScore?: number;
          escalationReason?: string;
        };

        log.info(`[Wave ${waveNumber}] Auto-fix completed`, {
          success: fixData.success,
          escalated: fixData.escalated,
          attempts: fixData.attempts,
        });

        if (fixData.success) {
          log.info(`[Wave ${waveNumber}] Issues fixed successfully`);
          shouldProceedToIntegration = true;
          reviewScore = fixData.finalScore ?? reviewScore;
        } else if (fixData.escalated) {
          log.warn(`[Wave ${waveNumber}] Escalated to human review, stopping`);

          return {
            success: false,
            waveNumber,
            needsHumanReview: true,
            message: `Wave ${waveNumber} requires human review`,
            criticScore: reviewScore,
            escalationReason: fixData.escalationReason ?? "Unknown reason",
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
            priority: 1,
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
          if (!integrationResult || !integrationResult.data) {
            throw new Error("Invalid integration result");
          }

          const integrationData = integrationResult.data as {
            compatible?: boolean;
            compatibilityScore?: number;
            criticalIssues?: number;
          };
          const { compatible, compatibilityScore, criticalIssues } =
            integrationData;

          if (!compatible || (criticalIssues ?? 0) > 0) {
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
      await step.run(
        "trigger-preview-deployment",
        async () => {
          log.info(`[Wave ${waveNumber}] Deploying preview for UAT`);

          // Get deployment platform from project architecture
          const projectContext = await prisma.projectContext.findUnique({
            where: { projectId },
            select: { architecture: true },
          });

          const architecture = projectContext?.architecture as {
            infrastructureArchitecture?: {
              hosting?: string;
            };
          } | null;
          const platform =
            (typeof architecture?.infrastructureArchitecture?.hosting === "string"
              ? architecture.infrastructureArchitecture.hosting.toLowerCase()
              : null) || "vercel";

          await inngest.send({
            name: "agent/deployment.deploy",
            data: {
              taskId: `deploy-wave-${waveNumber}-preview`,
              projectId,
              userId,
              conversationId,
              environment: "preview" as const,
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
        if (!deploymentResult || !deploymentResult.data) {
          log.warn(
            `[Wave ${waveNumber}] Invalid deployment result`
          );
          return null;
        }
        
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

        const codebase = projectContext?.codebase as {
          githubRepoName?: string;
        } | null;
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

        const prResultRaw = await githubAgent.createPullRequest({
          projectId,
          repoName,
          branchName: mainBranch,
          title: `Wave ${waveNumber} - Feature Implementation${hasWarnings ? " ⚠️" : ""}`,
          description: prDescription,
          githubToken,
        });

        const prResult = prResultRaw as {
          success: boolean;
          message?: string;
          prNumber?: number;
          prUrl?: string;
        };

        if (!prResult.success) {
          throw new Error(`Failed to create PR: ${prResult.message ?? "Unknown error"}`);
        }

        await prisma.agentTask.updateMany({
          where: { projectId, waveNumber },
          data: {
            prNumber: prResult.prNumber ?? null,
            prUrl: prResult.prUrl ?? null,
            reviewStatus: "pending",
          },
        });

        return {
          prUrl: prResult.prUrl ?? "",
          prNumber: prResult.prNumber ?? 0,
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

      // ==========================================
      // STEP 9: TRIGGER NEXT WAVE OR COMPLETE PROJECT
      // ==========================================
      if (hasMoreTasks) {
        // More waves to execute - trigger next wave
        await step.run("trigger-next-wave", async () => {
          log.info(`[Wave ${waveNumber}] Triggering Wave ${waveNumber + 1}`);
          
          await inngest.send({
            name: "agent/wave.start",
            data: {
              projectId,
              userId,
              conversationId,
              waveNumber: waveNumber + 1,
            },
          });
        });
      } else {
        // No more waves - project is complete
        await step.run("mark-project-complete", async () => {
          log.info(`[Project] All waves complete! Marking project as completed`);

          await prisma.projectContext.update({
            where: { projectId },
            data: {
              currentPhase: "completed",
              updatedAt: new Date(),
            },
          });
        });

        // ==========================================
        // PROJECT COMPLETION TASKS
        // ==========================================

        // Generate final documentation
        await step.run("generate-final-documentation", async () => {
          log.info(`[Project] Generating final project documentation`);

          await inngest.send({
            name: "agent/documentation.generate",
            data: {
              taskId: `project-${projectId}-final-docs`,
              projectId,
              userId,
              conversationId,
              taskInput: {
                docType: "final",
                includeApiDocs: true,
                includeReadme: true,
                includeChangelog: true,
              },
            },
          });
        });

        // Collect all wave PRs for merging
        const wavePRs = await step.run("collect-wave-prs", async () => {
          const completedWaves = await prisma.executionWave.findMany({
            where: {
              projectId,
              status: { in: ["completed", "completed_with_warnings"] }
            },
            orderBy: { waveNumber: "asc" },
            select: { waveNumber: true },
          });

          const allPRs: Array<{ prNumber: number; prUrl: string; waveNumber: number }> = [];

          for (const wave of completedWaves) {
            const waveTasks = await prisma.agentTask.findMany({
              where: {
                projectId,
                waveNumber: wave.waveNumber,
                prNumber: { not: null },
              },
              select: { prNumber: true, prUrl: true },
              distinct: ["prNumber"],
            });

            for (const task of waveTasks) {
              if (task.prNumber && task.prUrl) {
                allPRs.push({
                  prNumber: task.prNumber,
                  prUrl: task.prUrl,
                  waveNumber: wave.waveNumber,
                });
              }
            }
          }

          log.info(`[Project] Found ${allPRs.length} PRs to merge`);
          return allPRs;
        });

        // Merge all wave PRs into main
        if (wavePRs.length > 0) {
          await step.run("merge-wave-prs", async () => {
            log.info(`[Project] Merging ${wavePRs.length} wave PRs into main`);

            const projectContext = await prisma.projectContext.findUnique({
              where: { projectId },
              select: { codebase: true },
            });

            const codebase = projectContext?.codebase as {
              githubRepoName?: string;
            } | null;
            const repoName = codebase?.githubRepoName;

            if (!repoName) {
              log.warn(`[Project] No GitHub repo configured, skipping PR merge`);
              return { merged: 0, skipped: wavePRs.length };
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
              log.warn(`[Project] No GitHub token found, skipping PR merge`);
              return { merged: 0, skipped: wavePRs.length };
            }

            const { githubAgent } = await import(
              "@/lib/agents/github/github-agent"
            );

            let merged = 0;
            let failed = 0;

            for (const pr of wavePRs) {
              try {
                const mergeResult = await githubAgent.mergePullRequest({
                  projectId,
                  repoName,
                  prNumber: pr.prNumber,
                  githubToken,
                  mergeMethod: "squash",
                }) as { success: boolean; message?: string };

                if (mergeResult.success) {
                  merged++;
                  log.info(`[Project] Merged PR #${pr.prNumber} (Wave ${pr.waveNumber})`);
                } else {
                  failed++;
                  log.warn(`[Project] Failed to merge PR #${pr.prNumber}: ${mergeResult.message}`);
                }
              } catch (mergeError) {
                failed++;
                log.warn(`[Project] Error merging PR #${pr.prNumber}`, { error: toError(mergeError).message });
              }
            }

            return { merged, failed };
          });
        }

        // Send completion notification to user
        await step.run("send-completion-notification", async () => {
          log.info(`[Project] Sending completion notification to user`);

          // Get project details for the notification (project name is in conversation title)
          const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { title: true },
          });

          const completedWaves = await prisma.executionWave.count({
            where: { projectId, status: { in: ["completed", "completed_with_warnings"] } },
          });

          await inngest.send({
            name: "notification/user.notify",
            data: {
              userId,
              type: "project_complete",
              title: "Project Completed! 🎉",
              message: `Your project "${conversation?.title || "Untitled"}" has been successfully completed with ${completedWaves} wave(s).`,
              metadata: {
                projectId,
                totalWaves: completedWaves,
                prsCreated: wavePRs.length,
              },
            },
          });
        });

        // Check if user has approved production deployment
        const shouldDeployProduction = await step.run("check-production-approval", async () => {
          const projectSettings = await prisma.projectContext.findUnique({
            where: { projectId },
            select: { settings: true },
          });

          const settings = projectSettings?.settings as {
            autoDeployProduction?: boolean;
          } | null;

          return settings?.autoDeployProduction === true;
        });

        // Trigger production deployment if approved
        if (shouldDeployProduction) {
          await step.run("trigger-production-deployment", async () => {
            log.info(`[Project] Auto-deploying to production (user approved)`);

            const projectContext = await prisma.projectContext.findUnique({
              where: { projectId },
              select: { architecture: true },
            });

            const architecture = projectContext?.architecture as {
              infrastructureArchitecture?: {
                hosting?: string;
              };
            } | null;
            const platform =
              (typeof architecture?.infrastructureArchitecture?.hosting === "string"
                ? architecture.infrastructureArchitecture.hosting.toLowerCase()
                : null) || "vercel";

            await inngest.send({
              name: "agent/deployment.deploy",
              data: {
                taskId: `deploy-project-${projectId}-production`,
                projectId,
                userId,
                conversationId,
                environment: "production" as const,
                taskInput: {
                  platform,
                  environment: "production",
                  runMigrations: true,
                  productionBranch: "main",
                },
              },
            });
          });
        } else {
          log.info(`[Project] Production deployment not auto-approved, awaiting user action`);
        }
      }

      return {
        success: true,
        waveNumber,
        prUrl: prResult.prUrl,
        prNumber: prResult.prNumber,
        previewUrl, // ✅ Include preview URL in response
        hasMoreWaves: hasMoreTasks,
        criticScore: reviewScore,
        hasWarnings,
        message: hasMoreTasks 
          ? `Wave ${waveNumber} complete! Starting Wave ${waveNumber + 1}...`
          : `Wave ${waveNumber} complete! All waves finished - project completed! 🎉`,
      };
    } catch (error) {
      log.error(`[Wave ${waveNumber}] Wave completion failed`, toError(error));
      throw toError(error);
    }
  }
);
