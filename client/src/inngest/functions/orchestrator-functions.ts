import { orchestrator } from "@/lib/orchestrator/agent-orchestrator";
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import { createAgentError, toError } from "@/lib/error-utils";

export const orchestratorRunFunction = inngest.createFunction(
  {
    id: "agent-orchestrator-run",
    name: "Agent Orchestrator - Run Full Analysis Pipeline",
    retries: 3,
    timeouts: { start: "30m" },
  },
  { event: "agent/orchestrator.run" },
  async ({ event, step }) => {
    const { projectId, userId, conversationId, blueprint } = event.data;

    const log = logger.child({
      inngestFunction: "orchestratorRun",
      projectId,
      userId,
      runId: event.id,
    });

    log.info("[Orchestrator] Starting full analysis pipeline", { projectId });

    try {
      // Step 1: Run the full orchestrator pipeline
      const result = await step.run("run-full-orchestrator", async () => {
        return await orchestrator.execute({
          projectId,
          userId,
          conversationId,
          blueprint,
        });
      });

      if (!result.success) {
        log.error("[Orchestrator] Pipeline failed", createAgentError(result.message, { 
          projectId,
          error: result.failedAt 
        }));
        throw new Error(result.message);
      }

      log.info("[Orchestrator] Pipeline completed successfully", {
        projectId,
        phases: result.completedPhases.length,
        duration: `${result.totalDuration}ms`,
      });

      // Step 2: Optional - Send completion notification
      await step.run("send-completion-notification", async () => {
        log.info("[Orchestrator] Analysis complete notification", {
          projectId,
          userId,
        });
        // TODO: Send email/webhook notification to user
        // Example: await sendEmail(userId, 'Your project analysis is complete!')
      });

      return {
        success: true,
        projectId,
        completedPhases: result.completedPhases.map((p) => p.phase),
        currentPhase: result.currentPhase,
        totalDuration: result.totalDuration,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.error("[Orchestrator] Pipeline error", createAgentError(errorMessage, { projectId }));

      // Step 3: Send error notification
      await step.run("send-error-notification", async () => {
        log.error("[Orchestrator] Error notification sent", createAgentError(errorMessage, { projectId }));
        // TODO: Send error notification
      });

      throw error;
    }
  }
);

/**
 * Inngest function for resuming orchestration from current phase
 */
export const orchestratorResumeFunction = inngest.createFunction(
  {
    id: "agent-orchestrator-resume",
    name: "Agent Orchestrator - Resume Pipeline",
    retries: 2,
    timeouts: { start: "20m" },
  },
  { event: "agent/orchestrator.resume" },
  async ({ event, step }) => {
    const { projectId, userId, conversationId } = event.data;

    const log = logger.child({
      inngestFunction: "orchestratorResume",
      projectId,
      userId,
      runId: event.id,
    });

    log.info("[Orchestrator] Resuming pipeline", { projectId });

    try {
      const result = await step.run("resume-orchestrator", async () => {
        return await orchestrator.resume(projectId, userId, conversationId);
      });

      if (!result.success) {
        throw new Error(result.message);
      }

      log.info("[Orchestrator] Pipeline resumed successfully", {
        projectId,
        completedPhases: result.completedPhases.length,
      });

      return {
        success: true,
        projectId,
        completedPhases: result.completedPhases.map((p) => p.phase),
        currentPhase: result.currentPhase,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.error("[Orchestrator] Resume error", createAgentError(errorMessage, { projectId }));
      throw error;
    }
  }
);
