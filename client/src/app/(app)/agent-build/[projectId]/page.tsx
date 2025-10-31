// src/app/(app)/agent-build/[projectId]/page.tsx

"use client";
import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { logger } from "@/lib/logger";
import { projectAgentDataSchema, type ValidatedProjectAgentData } from "@/types/agent-schemas";

// Import Components
import AgentControl from "@/components/agent/AgentControl";
import AgentPlanner from "@/components/agent/AgentPlanner";
import SandboxLogsViewer from "@/components/agent/SandboxLogsViewer";
import AgentArtifacts from "@/components/agent/AgentArtifacts";
import AgentEnvConfigurator from "@/components/agent/AgentEnvConfigurator";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import toast from "react-hot-toast";


// --- SWR Fetcher with Validation ---
const fetcher = async (url: string): Promise<ValidatedProjectAgentData> => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorJson: unknown = await res.json().catch(() => null);
    const message =
      typeof errorJson === "object" &&
      errorJson !== null &&
      "error" in errorJson &&
      typeof (errorJson as { error: string }).error === "string"
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
  const projectApiUrl = projectId
    ? `/api/projects/${projectId}/agent/state`
    : null;


  const {
    data: projectData,
    error,
    isLoading: isLoadingProjectData,
    isValidating,
    mutate: revalidateProjectData,
  } = useSWR<ValidatedProjectAgentData, Error>(projectApiUrl, fetcher, {
    // This function-based interval will poll every 5s ONLY if the agent
    // is in an active state. Otherwise, it will stop polling (return 0).
    refreshInterval: (data) => {
      if (!data) return 5000; // Poll if no data yet
      const status = data.agentStatus; // Active states that require polling:
      if (status === "EXECUTING" || status === "PLANNING" || status === null) {
        return 5000;
      } // Resting states (PENDING_USER_INPUT, PENDING_CONFIGURATION, COMPLETE, ERROR, etc.)
      // Stop polling. We will trigger revalidation manually.
      return 0;
    }, // By REMOVING the `isPaused` function, our manual calls to
    // `revalidateProjectData()` will no longer be blocked.
  });

  const [isPlanning, setIsPlanning] = useState(false);
  const [isPlanInitiated, setIsPlanInitiated] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isExecutingStep, setIsExecutingStep] = useState(false);

  // --- Trigger Initial Planning ---
  useEffect(() => {
    const triggerPlan = async () => {
      // This function is now only called when we are sure we need to plan.
      // The isPlanInitiated flag prevents re-entry from the same client state.
      if (isPlanInitiated) return;
      setIsPlanInitiated(true); // Set latch immediately

      setIsPlanning(true);
      setPlanError(null);
      logger.info("[BuildAgentPage] Triggering initial agent planning...");
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
          "[BuildAgentPage] Planning initiated. Revalidating data..."
        );
        await revalidateProjectData(); // SWR will refetch the state
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown planning error.";
        logger.error("[BuildAgentPage] Error triggering plan:", err instanceof Error ? err : undefined);
        setPlanError(message);
        toast.error(`Failed to start planning: ${message}`);
        setIsPlanInitiated(false); // Reset latch on failure to allow retry
      } finally {
        setIsPlanning(false);
      }
    };

    // Do not run if SWR is loading/validating, a plan is already being created,
    // a plan has already been initiated, or there's an error.
    if (
      isLoadingProjectData ||
      isValidating ||
      isPlanning ||
      isPlanInitiated ||
      !projectId ||
      error
    ) {
      return;
    }

    // After loading, if there is NO project data, or if the project data
    // exists but has a `null` status, we should initiate planning.
    if (projectData === undefined || projectData.agentStatus === null) {
      void triggerPlan();
    }
  }, [
    projectData,
    isLoadingProjectData,
    isValidating,
    error,
    projectId,
    isPlanning,
    revalidateProjectData,
    isPlanInitiated,
  ]);

  // --- Callbacks ---
  const handleActionComplete = useCallback(async () => {
    logger.info(
      "[BuildAgentPage] Action complete, revalidating project data..."
    );
    await revalidateProjectData();
  }, [revalidateProjectData]);

  const handleExecuteNextStep = useCallback(async () => {
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
          : "Step execution queued.";
      logger.info(`[BuildAgentPage] Execute step response: ${statusMessage}`);
      toast.success(statusMessage);
      await revalidateProjectData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to execute step.";
      logger.error("[BuildAgentPage] Error executing step:", err instanceof Error ? err : undefined);
      toast.error(message);
      await revalidateProjectData();
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
  const isLoading = isLoadingProjectData || isPlanning;

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
  if (!projectData || projectData.agentStatus === null) {
    // This is the state we are stuck in.
    return <div className="p-4">Initializing agent...</div>;
  }

  const agentStatus = projectData.agentStatus;
  const showPlanner = agentStatus === "PENDING_USER_INPUT";
  const showConfigurator = agentStatus === "PENDING_CONFIGURATION";
  const showControls =
    !showPlanner && !showConfigurator && agentStatus !== null;

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
          onExecuteStart={() => void handleExecuteNextStep()}
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
              ? {
                  ...projectData.agentExecutionHistory[
                    projectData.agentExecutionHistory.length - 1
                  ],
                  filesWritten:
                    projectData.agentExecutionHistory[
                      projectData.agentExecutionHistory.length - 1
                    ].filesWritten ?? undefined,
                  commandsRun:
                    projectData.agentExecutionHistory[
                      projectData.agentExecutionHistory.length - 1
                    ].commandsRun ?? undefined,
                  errorMessage:
                    projectData.agentExecutionHistory[
                      projectData.agentExecutionHistory.length - 1
                    ].errorMessage ?? undefined,
                  errorDetails:
                    projectData.agentExecutionHistory[
                      projectData.agentExecutionHistory.length - 1
                    ].errorDetails ?? undefined,
                }
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
