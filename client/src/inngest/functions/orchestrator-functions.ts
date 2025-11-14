//src/inngest/functions/orchestrator-functions.ts
import { orchestrator } from "@/lib/orchestrator/agent-orchestrator";
import { inngest } from "../client";
import { logger } from "@/lib/logger";
import { createAgentError, toError } from "@/lib/error-utils";
import { sendNotification } from "@/lib/notifications/notification-service";
import prisma from "@/lib/prisma";

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

      // Note: Skipping analysis complete notification per user preference

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
        try {
          await sendNotification({
            userId,
            projectId,
            type: "error_occurred",
            priority: "critical",
            title: "Orchestrator Pipeline Error",
            message: `The analysis pipeline encountered an error: ${errorMessage}`,
            error: errorMessage,
            phase: "orchestration",
            canRetry: true,
          });
          log.info("[Orchestrator] Error notification sent");
        } catch (notifError) {
          log.error("[Orchestrator] Failed to send error notification", toError(notifError));
        }
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

/**
 * Inngest function for vision-based orchestration (from Agentic Interface)
 */
export const orchestratorVisionFunction = inngest.createFunction(
  {
    id: "agent-orchestrator-vision",
    name: "Agent Orchestrator - Vision to App Build",
    retries: 3,
    timeouts: { start: "30m" },
  },
  { event: "agent/orchestrator.vision" },
  async ({ event, step }) => {
    const { projectId, userId, visionText, projectName, techPreferences } = event.data;

    const log = logger.child({
      inngestFunction: "orchestratorVision",
      projectId,
      userId,
      runId: event.id,
    });

    log.info("[Orchestrator] Starting vision-based build", { 
      projectId,
      projectName,
      visionLength: visionText.length 
    });

    try {
      // Step 1: Execute vision-based orchestration
      const result = await step.run("execute-vision-orchestration", async () => {
        return await orchestrator.executeVision({
          projectId,
          userId,
          visionText,
          projectName,
          techPreferences,
        });
      });

      if (!result.success) {
        log.error("[Orchestrator] Vision build failed", createAgentError(result.message, { 
          projectId,
          error: result.failedAt 
        }));
        throw new Error(result.message);
      }

      log.info("[Orchestrator] Vision build completed successfully", {
        projectId,
        projectName,
        phases: result.completedPhases?.length || 0,
        duration: `${result.totalDuration}ms`,
      });

      // Note: Skipping vision build complete notification per user preference

      return {
        success: true,
        projectId,
        projectName,
        completedPhases: result.completedPhases?.map((p: any) => p.phase) || [],
        currentPhase: result.currentPhase,
        totalDuration: result.totalDuration,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.error("[Orchestrator] Vision build error", createAgentError(errorMessage, { projectId }));

      await step.run("send-error-notification", async () => {
        try {
          await sendNotification({
            userId,
            projectId,
            type: "error_occurred",
            priority: "critical",
            title: "Vision Build Error",
            message: `The vision-based build encountered an error: ${errorMessage}`,
            error: errorMessage,
            phase: "vision-build",
            canRetry: true,
          });
          log.info("[Orchestrator] Error notification sent");
        } catch (notifError) {
          log.error("[Orchestrator] Failed to send error notification", toError(notifError));
        }
      });

      throw error;
    }
  }
);

/**
 * Inngest function for blueprint-based orchestration (from SprintDashboard)
 */
export const orchestratorBlueprintFunction = inngest.createFunction(
  {
    id: "agent-orchestrator-blueprint",
    name: "Agent Orchestrator - Blueprint to MVP Build",
    retries: 3,
    timeouts: { start: "30m" },
  },
  { event: "agent/orchestrator.blueprint" },
  async ({ event, step }) => {
    const { projectId, userId, conversationId, blueprint, sprintData } = event.data;

    const log = logger.child({
      inngestFunction: "orchestratorBlueprint",
      projectId,
      userId,
      runId: event.id,
    });

    log.info("[Orchestrator] Starting blueprint-based build", { 
      projectId,
      conversationId,
      hasSprintData: !!sprintData,
      blueprintLength: blueprint.length 
    });

    try {
      // Step 1: Execute blueprint-based orchestration
      const result = await step.run("execute-blueprint-orchestration", async () => {
        return await orchestrator.executeBlueprint({
          projectId,
          userId,
          conversationId,
          blueprint,
          sprintData,
        });
      });

      if (!result.success) {
        log.error("[Orchestrator] Blueprint build failed", createAgentError(result.message, { 
          projectId,
          error: result.failedAt 
        }));
        throw new Error(result.message);
      }

      log.info("[Orchestrator] Blueprint build completed successfully", {
        projectId,
        conversationId,
        phases: result.completedPhases?.length || 0,
        duration: `${result.totalDuration}ms`,
      });

      // Note: Skipping blueprint build complete notification per user preference

      return {
        success: true,
        projectId,
        conversationId,
        completedPhases: result.completedPhases?.map((p: any) => p.phase) || [],
        currentPhase: result.currentPhase,
        totalDuration: result.totalDuration,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      log.error("[Orchestrator] Blueprint build error", createAgentError(errorMessage, { projectId }));

      await step.run("send-error-notification", async () => {
        try {
          await sendNotification({
            userId,
            projectId,
            type: "error_occurred",
            priority: "critical",
            title: "Blueprint Build Error",
            message: `The blueprint build encountered an error: ${errorMessage}`,
            error: errorMessage,
            phase: "blueprint-build",
            canRetry: true,
          });
          log.info("[Orchestrator] Error notification sent");
        } catch (notifError) {
          log.error("[Orchestrator] Failed to send error notification", toError(notifError));
        }
      });

      throw error;
    }
  }
);
