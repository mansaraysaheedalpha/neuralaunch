// src/app/(app)/agent-build/[projectId]/page.tsx

"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR, { mutate, useSWRConfig } from "swr";
import { logger } from "@/lib/logger";
import { z } from "zod";
import type {
  PlanStep,
  Question,
  StepResult,
  AccountInfo,
} from "@/types/agent";

// Import Components
import AgentControl from "@/components/agent/AgentControl";
import AgentPlanner from "@/components/agent/AgentPlanner";
import SandboxLogsViewer from "@/components/agent/SandboxLogsViewer";
import AgentArtifacts from "@/components/agent/AgentArtifacts";
import AgentEnvConfigurator from "@/components/agent/AgentEnvConfigurator";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import toast from "react-hot-toast";

// --- Zod Schema for Data Validation ---
const stepResultSchema = z.object({
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
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
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
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  errorMessage: z.string().optional().nullable(),
  errorDetails: z.string().optional().nullable(),
  prUrl: z.string().nullable().optional(),
});

const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()).nullable().optional(),
  allowAgentDecision: z.boolean().nullable().optional(),
});

const projectAgentDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  agentPlan: z.array(z.object({ task: z.string() })).nullable(),
  agentClarificationQuestions: z.array(questionSchema).nullable(),
  agentUserResponses: z.record(z.string()).nullable(),
  agentCurrentStep: z.number().nullable(),
  agentStatus: z.string().nullable(),
  agentExecutionHistory: z.array(stepResultSchema).nullable(),
  agentRequiredEnvKeys: z.array(z.string()).nullable(),
  githubRepoUrl: z.string().nullable(),
  githubRepoName: z.string().nullable(),
  vercelProjectId: z.string().nullable(),
  vercelProjectUrl: z.string().nullable(),
  vercelDeploymentUrl: z.string().nullable(),
  accounts: z.array(
    z.object({
      provider: z.string(),
      providerAccountId: z.string(),
    })
  ),
});

type ValidatedProjectAgentData = z.infer<typeof projectAgentDataSchema>;

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
      validationResult.error.format()
    );
    throw new Error(
      `Invalid data structure received from API: ${validationResult.error.errors[0]?.message || "Validation failed"}`
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

  const { cache } = useSWRConfig();

  const {
    data: projectData,
    error,
    isLoading: isLoadingProjectData,
    isValidating,
    mutate: revalidateProjectData,
  } = useSWR<ValidatedProjectAgentData, Error>(projectApiUrl, fetcher, {
    refreshInterval: 5000,
    isPaused: (): boolean => {
      const data = projectApiUrl
        ? (cache.get(projectApiUrl)?.data as
            | ValidatedProjectAgentData
            | undefined)
        : undefined;
      return (
        data?.agentStatus !== "EXECUTING" && data?.agentStatus !== "PLANNING"
      );
    },
  });

  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isExecutingStep, setIsExecutingStep] = useState(false);

  // --- Trigger Initial Planning ---
  useEffect(() => {
    // *** THIS IS THE CORRECTED LOGIC ***

    // Do not run if SWR is loading, revalidating, we are already planning,
    // there's a project ID missing, or an error has occurred.
    if (
      isLoadingProjectData ||
      isValidating ||
      isPlanning ||
      !projectId ||
      error
    ) {
      return;
    }

    // At this point, loading is finished and there are no errors.
    // We can now safely check the state of `projectData`.

    // Case 1: `projectData` is undefined. This means SWR loaded, but
    // the API returned nothing (e.g., 404, which *should* be an error,
    // but we check anyway). This is an unexpected state.
    if (projectData === undefined) {
      // This might happen on the very first load if SWR hasn't
      // returned the initial `undefined` data yet.
      // The `isLoadingProjectData` guard should prevent this, but we double-check.
      return;
    }

    // Case 2: `projectData` is loaded AND its `agentStatus` is `null`.
    // This is the trigger. It means the DB has a record, but no plan
    // has ever been created for it.
    if (projectData.agentStatus === null) {
      const triggerPlan = async () => {
        setIsPlanning(true);
        setPlanError(null);
        logger.info(
          "[BuildAgentPage] agentStatus is null. Triggering planning..."
        );
        try {
          const res = await fetch(`/api/projects/${projectId}/agent/plan`, {
            method: "POST",
          });
          if (!res.ok) {
            const errData = await res
              .json()
              .catch(() => ({ error: "Failed to trigger plan" }));
            throw new Error(errData.error || `API Error: ${res.status}`);
          }
          logger.info("[BuildAgentPage] Planning initiated. Revalidating...");
          await revalidateProjectData();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown planning error.";
          logger.error("[BuildAgentPage] Error triggering plan:", err);
          setPlanError(message);
          toast.error(`Failed to start planning: ${message}`);
        } finally {
          setIsPlanning(false);
        }
      };
      void triggerPlan();
    }

    // If projectData exists AND agentStatus is NOT null (e.g., it's "PENDING_USER_INPUT"),
    // this hook does nothing, which is correct.
  }, [
    projectData,
    isLoadingProjectData,
    isValidating,
    error,
    projectId,
    isPlanning,
    revalidateProjectData,
  ]);
  // *** END OF CORRECTED LOGIC ***

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
      logger.error("[BuildAgentPage] Error executing step:", err);
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
  if (!projectData) {
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
          onExecuteStart={handleExecuteNextStep}
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
