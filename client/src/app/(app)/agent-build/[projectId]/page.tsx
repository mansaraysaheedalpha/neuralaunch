"use client"; // Required for SWR and client-side interactions

import { useState, useCallback } from "react";
import { useParams } from "next/navigation"; // To get projectId from URL
import useSWR, { mutate } from "swr"; // For data fetching and cache mutation
import { logger } from "@/lib/logger"; // Your logger
import type { ProjectAgentData } from "@/types/agent"; // Import shared types

// Import the components we've designed
import AgentControl from "@/components/agent/AgentControl";
import AgentPlanner from "@/components/agent/AgentPlanner";
import SandboxLogsViewer from "@/components/agent/SandboxLogsViewer";
import AgentArtifacts from "@/components/agent/AgentArtifacts";
import LoadingSkeleton from "@/components/LoadingSkeleton"; // Assuming you have a loading component

// --- SWR Fetcher ---
const fetcher = async (url: string): Promise<ProjectAgentData> => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res
      .json()
      .catch(() => ({ error: `API Error: ${res.status}` }));
    throw new Error(errorData.error || `API Error: ${res.status}`);
  }
  return res.json();
};

// --- The Page Component ---
export default function BuildAgentPage() {
  const params = useParams();
  const projectId = params.projectId as string; // Get projectId from URL

  // API endpoint to fetch project agent data AND connected accounts
  const projectApiUrl = `/api/projects/${projectId}/agent/state`; // Define this new backend route

  const {
    data: projectData,
    error,
    isLoading,
  } = useSWR<ProjectAgentData>(
    projectId ? projectApiUrl : null, // Fetch only if projectId is available
    fetcher,
    {
      refreshInterval: 5000, // Optional: Poll for status updates
      // Only poll when the agent is actively executing
      isPaused: (): boolean => {
        // Access projectData through the closure, but TypeScript needs explicit type
        const data = projectData;
        return data?.agentStatus !== "EXECUTING";
      },
    }
  );

  // --- State for local UI feedback (optional, API responses update props eventually) ---
  const [isExecutingStep, setIsExecutingStep] = useState(false);

  // --- Derived Connection Status ---
  const isGitHubConnected = !!projectData?.accounts?.some(
    (acc) => acc.provider === "github"
  );
  const isVercelConnected = !!projectData?.accounts?.some(
    (acc) => acc.provider === "vercel"
  );

  // --- Callback Implementations ---
  const handleActionComplete = useCallback(() => {
    // Revalidate the project data using SWR's mutate
    logger.info(
      "[BuildAgentPage] Action complete, revalidating project data..."
    );
    mutate(projectApiUrl);
  }, [projectApiUrl]);

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
      const result = await response.json(); // Contains status, message, stepResult
      if (!response.ok) {
        throw new Error(
          result.error || `Failed to execute step (${response.status})`
        );
      }
      logger.info(`[BuildAgentPage] Execute step response: ${result.status}`);
      // Manually trigger revalidation immediately for faster UI update
      mutate(projectApiUrl);
      // Optional: Update local state based on result for immediate feedback before SWR polls
      // if (result.agentStatus) { /* update local status if needed */ }
    } catch (err) {
      logger.error(
        "[BuildAgentPage] Error executing step:",
        err instanceof Error ? err : undefined
      );
      // Update UI to show error (though SWR refresh should also catch it)
      mutate(projectApiUrl); // Ensure error status is fetched
    } finally {
      setIsExecutingStep(false);
    }
  }, [
    projectId,
    projectApiUrl,
    isExecutingStep,
    projectData?.agentCurrentStep,
  ]);

  // --- Render Logic ---
  if (isLoading) {
    return <LoadingSkeleton />; // Your loading state
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        Error loading agent data: {error.message}
      </div>
    );
  }

  if (!projectData) {
    return <div className="p-4">Project data not found.</div>; // Should not happen if projectId is valid
  }

  // Pass necessary data down to child components
  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      <h1 className="text-3xl font-bold mb-6">
        AI Agent Build: {projectData.title}
      </h1>

      {/* Conditionally render Planner or Control based on status */}
      {projectData.agentStatus === "PENDING_USER_INPUT" ? (
        <AgentPlanner
          projectId={projectId}
          plan={projectData.agentPlan}
          questions={projectData.agentClarificationQuestions}
          initialAgentStatus={projectData.agentStatus}
          onAnswersSubmit={handleActionComplete} // Revalidate after submitting answers
          onExecuteStart={handleExecuteNextStep} // Trigger first step
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
              : (projectData.agentExecutionHistory?.length ?? 0) > 0 // Show last completed task if possible
                ? projectData.agentExecutionHistory![
                    projectData.agentExecutionHistory!.length - 1
                  ].taskDescription
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
        onActionComplete={handleActionComplete} // Pass revalidation callback
      />
    </div>
  );
}
