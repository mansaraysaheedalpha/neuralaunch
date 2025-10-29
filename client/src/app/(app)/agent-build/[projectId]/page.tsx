"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { logger } from "@/lib/logger";
import {
  ProjectAgentData,
  AgentStatus,
  StepResult,
} from "@/lib/types/agent";

// Import UI components
import AgentControl from "@/components/agent/AgentControl";
import AgentPlanner from "@/components/agent/AgentPlanner";
import SandboxLogsViewer from "@/components/agent/SandboxLogsViewer";
import AgentArtifacts from "@/components/agent/AgentArtifacts";
import LoadingSkeleton from "@/components/LoadingSkeleton";

// --- SWR Fetcher for initial data load ---
const fetcher = async (url: string): Promise<ProjectAgentData> => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      errorData.error || `API Error: ${res.status}`
    );
  }
  return res.json();
};

// --- Custom Hook for Agent State & SSE ---
function useAgentState(projectId: string) {
  const projectApiUrl = `/api/projects/${projectId}/agent/state`;

  // Use SWR for the initial data load
  const {
    data: initialData,
    error: initialError,
    isLoading: isInitialLoading,
    mutate,
  } = useSWR<ProjectAgentData>(projectId ? projectApiUrl : null, fetcher, {
    revalidateOnFocus: false, // SSE will handle updates
  });

  const [agentData, setAgentData] = useState<ProjectAgentData | null>(
    initialData || null
  );

  // Update local state when SWR fetches initial data
  useEffect(() => {
    if (initialData) {
      setAgentData(initialData);
    }
  }, [initialData]);

  // Effect to connect to the SSE stream
  useEffect(() => {
    if (!projectId) return;

    const eventSource = new EventSource(
      `/api/projects/${projectId}/agent/events`
    );

    eventSource.onopen = () => {
      logger.info("[SSE] Connection opened.");
    };

    eventSource.onmessage = (event) => {
      const eventData = JSON.parse(event.data);
      logger.info("[SSE] Received event:", eventData);

      setAgentData((currentData) => {
        if (!currentData) return null;

        switch (eventData.type) {
          case "status_update":
            return { ...currentData, agentStatus: eventData.status };
          case "step_start":
            return {
              ...currentData,
              agentStatus: "EXECUTING" as AgentStatus,
              agentCurrentStep: eventData.taskIndex,
            };
          case "step_complete":
            // Refetch the full state to get the latest history and artifacts
            mutate();
            return {
              ...currentData,
              agentStatus: eventData.isComplete
                ? ("COMPLETE" as AgentStatus)
                : ("PAUSED_AFTER_STEP" as AgentStatus),
            };
          case "error":
            // Refetch to get detailed error info in history
            mutate();
            return { ...currentData, agentStatus: "ERROR" as AgentStatus };
          // NOTE: A 'log' event type could be handled here to update a log viewer component
          default:
            return currentData;
        }
      });
    };

    eventSource.onerror = (err) => {
      logger.error("[SSE] Connection error:", err);
      eventSource.close();
    };

    // Cleanup on component unmount
    return () => {
      logger.info("[SSE] Closing connection.");
      eventSource.close();
    };
  }, [projectId, mutate]);

  return {
    agentData,
    error: initialError,
    isLoading: isInitialLoading && !agentData,
    mutate,
  };
}

// --- The Page Component ---
export default function BuildAgentPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const {
    agentData: projectData,
    error,
    isLoading,
    mutate,
  } = useAgentState(projectId);

  const handleActionComplete = useCallback(() => {
    // Revalidate data after user actions like submitting answers or creating artifacts
    mutate();
  }, [mutate]);

  const handleExecuteNextStep = useCallback(async () => {
    if (!projectId) return;
    logger.info("[BuildAgentPage] Triggering agent execution...");
    try {
      // This API call now returns immediately with 202 Accepted
      const response = await fetch(`/api/projects/${projectId}/agent/execute`, {
        method: "POST",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to start execution.");
      }
      // The UI will update via SSE, no immediate mutation needed here
    } catch (err) {
      logger.error("[BuildAgentPage] Error triggering execution:", err);
      // Optionally show a toast notification for the error
    }
  }, [projectId]);

  // --- Render Logic ---
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        Error loading agent data: {error.message}
      </div>
    );
  }

  if (!projectData) {
    return <div className="p-4">Project data not found.</div>;
  }

  const isGitHubConnected = !!projectData.accounts?.some(
    (acc) => acc.provider === "github"
  );
  const isVercelConnected = !!projectData.accounts?.some(
    (acc) => acc.provider === "vercel"
  );

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      <h1 className="text-3xl font-bold mb-6">
        AI Agent Build: {projectData.title}
      </h1>

      {projectData.agentStatus === "PENDING_USER_INPUT" ? (
        <AgentPlanner
          projectId={projectId}
          plan={projectData.agentPlan}
          questions={projectData.agentClarificationQuestions}
          initialAgentStatus={projectData.agentStatus}
          onAnswersSubmit={handleActionComplete}
          onExecuteStart={handleExecuteNextStep}
        />
      ) : (
        <AgentControl
          projectId={projectId}
          currentStepIndex={projectData.agentCurrentStep}
          totalSteps={projectData.agentPlan?.length ?? 0}
          currentTaskDescription={
            projectData.agentPlan &&
            projectData.agentCurrentStep !== null &&
            projectData.agentCurrentStep < projectData.agentPlan.length
              ? projectData.agentPlan[projectData.agentCurrentStep].task
              : null
          }
          agentStatus={projectData.agentStatus}
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

      <SandboxLogsViewer projectId={projectId} />

      <AgentArtifacts
        projectId={projectId}
        githubRepoUrl={projectData.githubRepoUrl}
        githubRepoName={projectData.githubRepoName}
        vercelProjectUrl={projectData.vercelProjectUrl}
        vercelDeploymentUrl={projectData.vercelDeploymentUrl}
        agentStatus={projectData.agentStatus}
        isGitHubConnected={isGitHubConnected}
        isVercelConnected={isVercelConnected}
        onActionComplete={handleActionComplete}
      />
    </div>
  );
}
