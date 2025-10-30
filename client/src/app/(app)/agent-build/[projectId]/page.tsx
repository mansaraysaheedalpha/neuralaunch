// src/app/(app)/agent-build/[projectId]/page.tsx

"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { logger } from "@/lib/logger";

// --- Import Components ---
import AgentControl from "@/components/agent/AgentControl";
import AgentPlanner from "@/components/agent/AgentPlanner";
import SandboxLogsViewer from "@/components/agent/SandboxLogsViewer";
import AgentArtifacts from "@/components/agent/AgentArtifacts";
import AgentEnvConfigurator from "@/components/agent/AgentEnvConfigurator"; // *** NEW IMPORT ***
import LoadingSkeleton from "@/components/LoadingSkeleton";
import toast from "react-hot-toast"; // For potential notifications

// Add this near the top of BuildAgentPage.tsx, after imports
import { z } from "zod";

// Zod schema mirroring ProjectAgentData in types/agent.ts
const projectAgentDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  agentPlan: z.array(z.object({ task: z.string() })).nullable(),
  agentClarificationQuestions: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        options: z.array(z.string()).optional(), // Add optional fields from Question type
        allowAgentDecision: z.boolean().optional(),
      })
    )
    .nullable(),
  agentUserResponses: z.record(z.string(), z.string()).nullable(), // Assuming simple key-value for now
  agentCurrentStep: z.number().nullable(),
  agentStatus: z.string().nullable(),
  agentExecutionHistory: z
    .array(
      z.object({
        // Define StepResult structure more precisely if needed
        startTime: z.string(),
        endTime: z.string(),
        taskIndex: z.number(),
        taskDescription: z.string(),
        status: z.enum(["success", "error"]),
        summary: z.string(),
        filesWritten: z
          .array(
            z.object({
              path: z.string(),
              success: z.boolean(),
              message: z.string().optional(),
            })
          )
          .optional(),
        commandsRun: z
          .array(
            z.object({
              command: z.string(),
              attempt: z.number(),
              exitCode: z.number(),
              stdout: z.string().optional(),
              stderr: z.string().optional(),
              correctedCommand: z.string().optional(),
            })
          )
          .optional(),
        errorMessage: z.string().optional(),
        errorDetails: z.string().optional(),
        prUrl: z.string().nullable().optional(),
      })
    )
    .nullable(),
  agentRequiredEnvKeys: z.array(z.string()).nullable(), // *** ADDED THIS FIELD ***
  githubRepoUrl: z.string().nullable(),
  githubRepoName: z.string().nullable(),
  vercelProjectId: z.string().nullable(),
  vercelProjectUrl: z.string().nullable(),
  vercelDeploymentUrl: z.string().nullable(),
  accounts: z.array(
    z.object({
      // AccountInfo type
      provider: z.string(),
      providerAccountId: z.string(),
    })
  ),
});

// Infer the type from the schema (optional, but good practice)
type ValidatedProjectAgentData = z.infer<typeof projectAgentDataSchema>;

// --- SWR Fetcher ---
const fetcher = async (url: string): Promise<ValidatedProjectAgentData> => {
  // Use inferred type
  const res = await fetch(url);
  if (!res.ok) {
    const errorJson: unknown = await res.json().catch(() => null);
    const message =
      typeof errorJson === "object" &&
      errorJson !== null &&
      "error" in errorJson &&
      typeof (errorJson as { error: unknown }).error === "string"
        ? (errorJson as { error: string }).error
        : `API Error: ${res.status}`;
    throw new Error(message);
  }
  const data: unknown = await res.json();
  const validationResult = projectAgentDataSchema.safeParse(data);
  if (!validationResult.success) {
    logger.error(
      "[BuildAgentPage] API data validation failed:",
      validationResult.error
    );
    throw new Error(
      `Invalid data structure received from API: ${validationResult.error.issues[0]?.message || "Validation failed"}`
    );
  }
  return validationResult.data;
};

// --- Page Component ---
export default function BuildAgentPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const projectApiUrl = `/api/projects/${projectId}/agent/state`;

  const {
    data: projectData,
    error,
    isLoading: isLoadingProjectData, // Renamed for clarity
    mutate: revalidateProjectData, // Renamed for clarity
  } = useSWR<ValidatedProjectAgentData, Error>(
    projectId ? projectApiUrl : null,
    fetcher,
    {
      refreshInterval: 5000,
      isPaused: (): boolean => {
        const data = projectData; // Access closure variable
        // Only poll actively when executing or potentially during initial planning/config phases if needed
        return (
          data?.agentStatus !== "EXECUTING" && data?.agentStatus !== "PLANNING"
        ); // Add PLANNING if you implement that status
      },
    }
  );

  // --- Local State ---
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isExecutingStep, setIsExecutingStep] = useState(false); // Already exists

  // --- Trigger Initial Planning ---
  useEffect(() => {
    // Only trigger if data isn't loading, project ID exists, no error, not already planning
    // And if the agent hasn't started yet (status is null/undefined or plan is null)
    if (!isLoadingProjectData && projectId && !error && !isPlanning) {
      // Check status and plan presence more robustly
      const needsPlanning =
        !projectData || (!projectData.agentStatus && !projectData.agentPlan);

      if (needsPlanning) {
        const triggerPlan = async () => {
          setIsPlanning(true);
          setPlanError(null);
          logger.info("[BuildAgentPage] No plan found. Triggering planning...");
          try {
            const res = await fetch(`/api/projects/${projectId}/agent/plan`, {
              method: "POST",
            });
            if (!res.ok) {
              const errData: unknown = await res
                .json()
                .catch(() => ({ error: "Failed to trigger plan" }));
              const message =
                typeof errData === "object" &&
                errData !== null &&
                "error" in errData &&
                typeof (errData as { error: unknown }).error === "string"
                  ? (errData as { error: string }).error
                  : `API Error: ${res.status}`;
              throw new Error(message);
            }
            logger.info(
              "[BuildAgentPage] Planning initiated successfully. Revalidating state..."
            );
            await revalidateProjectData(); // Revalidate immediately
          } catch (err) {
            logger.error(
              "[BuildAgentPage] Error triggering plan:",
              err instanceof Error ? err : undefined
            );
            const message =
              err instanceof Error ? err.message : "Unknown planning error.";
            setPlanError(message);
            toast.error(`Failed to start planning: ${message}`);
          } finally {
            setIsPlanning(false);
          }
        };
        void triggerPlan();
      }
    }
  }, [
    projectData,
    isLoadingProjectData,
    error,
    projectId,
    isPlanning,
    revalidateProjectData,
  ]);

  // --- Callbacks ---
  const handleActionComplete = useCallback(async () => {
    logger.info(
      "[BuildAgentPage] Action complete, revalidating project data..."
    );
    // Revalidate immediately and update UI optimistically if needed
    await revalidateProjectData();
    // You might show a toast or other feedback here
  }, [revalidateProjectData]);

  const handleExecuteNextStep = useCallback(async () => {
    // ... (existing handleExecuteNextStep logic - unchanged) ...
    if (!projectId || isExecutingStep) return;
    setIsExecutingStep(true);
    logger.info(
      `[BuildAgentPage] Triggering execution for step ${projectData?.agentCurrentStep ?? 0}...`
    );
    try {
      const response = await fetch(`/api/projects/${projectId}/agent/execute`, {
        method: "POST",
      });
      const resultJson: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof resultJson === "object" &&
          resultJson !== null &&
          "error" in resultJson &&
          typeof (resultJson as { error: unknown }).error === "string"
            ? (resultJson as { error: string }).error
            : `Failed to execute step (${response.status})`;
        throw new Error(message);
      }
      const statusMessage =
        typeof resultJson === "object" &&
        resultJson !== null &&
        "message" in resultJson &&
        typeof (resultJson as { message: unknown }).message === "string"
          ? (resultJson as { message: string }).message
          : "Step executed.";
      logger.info(`[BuildAgentPage] Execute step response: ${statusMessage}`);
      toast.success(statusMessage); // Give user feedback
      await revalidateProjectData(); // Revalidate data
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to execute step.";
      logger.error(
        "[BuildAgentPage] Error executing step:",
        err instanceof Error ? err : undefined
      );
      toast.error(message);
      await revalidateProjectData(); // Ensure error status is fetched
    } finally {
      setIsExecutingStep(false);
    }
  }, [
    projectId,
    revalidateProjectData,
    isExecutingStep,
    projectData?.agentCurrentStep,
  ]);

  // --- Derived Connection Status ---
  const isGitHubConnected = !!projectData?.accounts?.some(
    (acc) => acc.provider === "github"
  );
  const isVercelConnected = !!projectData?.accounts?.some(
    (acc) => acc.provider === "vercel"
  );

  // --- Render Logic ---
  const isLoading = isLoadingProjectData || isPlanning; // Combined loading state

  if (isLoading) {
    return <LoadingSkeleton />;
  }
  if (planError) {
    return (
      <div className="p-4 text-red-600">
        Error initiating agent plan: {planError}
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-red-600">
        Error loading agent data: {error.message}
      </div>
    );
  }
  if (!projectData) {
    return <div className="p-4">Project data not found or initializing...</div>;
  }

  // Determine which main component to show based on status
  const agentStatus = projectData.agentStatus;
  const showPlanner = agentStatus === "PENDING_USER_INPUT";
  const showConfigurator = agentStatus === "PENDING_CONFIGURATION";
  // Show controls for ready, executing, paused, error, or complete states
  const showControls =
    !showPlanner && !showConfigurator && agentStatus !== null; // Show controls unless planning/configuring or not started

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      <h1 className="text-3xl font-bold mb-6">
        AI Agent Build: {projectData.title}
      </h1>

      {showPlanner && (
        <AgentPlanner
          projectId={projectId}
          plan={projectData.agentPlan}
          questions={projectData.agentClarificationQuestions}
          initialAgentStatus={agentStatus}
          onActionComplete={() => void handleActionComplete()}
          onExecuteStart={() => void handleExecuteNextStep()} // This might still be useful if planning yields no questions/env vars
          onSubmissionError={(errMsg) =>
            toast.error(`Submission Error: ${errMsg}`)
          }
        />
      )}

      {showConfigurator && (
        <AgentEnvConfigurator
          projectId={projectId}
          requiredEnvKeys={
            Array.isArray(projectData.agentRequiredEnvKeys)
              ? projectData.agentRequiredEnvKeys
              : []
          }
          onActionComplete={() => void handleActionComplete()}
          onSubmissionError={(errMsg) =>
            toast.error(`Configuration Error: ${errMsg}`)
          }
        />
      )}

      {showControls && (
        <AgentControl
          currentStepIndex={projectData.agentCurrentStep}
          totalSteps={projectData.agentPlan?.length ?? 0}
          currentTaskDescription={
            projectData.agentPlan &&
            projectData.agentCurrentStep !== null &&
            projectData.agentCurrentStep < projectData.agentPlan.length
              ? projectData.agentPlan[projectData.agentCurrentStep].task
              : (projectData.agentExecutionHistory?.length ?? 0) > 0
                ? projectData.agentExecutionHistory![
                    projectData.agentExecutionHistory!.length - 1
                  ].taskDescription
                : null
          }
          agentStatus={agentStatus}
          lastStepResult={
            projectData.agentExecutionHistory &&
            projectData.agentExecutionHistory.length > 0
              ? projectData.agentExecutionHistory[
                  projectData.agentExecutionHistory.length - 1
                ]
              : null
          }
          onExecuteNextStep={handleExecuteNextStep}
        />
      )}

      {(projectData.agentPlan || projectData.agentStatus) && (
        <>
          <SandboxLogsViewer projectId={projectId} />
          <AgentArtifacts
            projectId={projectId}
            githubRepoUrl={projectData.githubRepoUrl}
            githubRepoName={projectData.githubRepoName}
            vercelProjectUrl={projectData.vercelProjectUrl}
            vercelDeploymentUrl={projectData.vercelDeploymentUrl}
            agentStatus={agentStatus}
            isGitHubConnected={isGitHubConnected}
            isVercelConnected={isVercelConnected}
            onActionComplete={() => void handleActionComplete()}
          />
        </>
      )}
    </div>
  );
}