// src/components/agent/AgentArtifacts.tsx

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Github, Box, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { logger } from "@/lib/logger";

// --- Helper Function Types ---
type CreateRepoResponse = { repoUrl: string; repoName: string };
type DeployResponse = { projectUrl: string; deploymentUrl: string };

// --- Helper Functions ---
function parseErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const maybeError = (data as Record<string, unknown>)["error"];
    if (typeof maybeError === "string") {
      return maybeError;
    }
  }
  return fallback;
}

function isCreateRepoResponse(data: unknown): data is CreateRepoResponse {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>)["repoUrl"] === "string" &&
    typeof (data as Record<string, unknown>)["repoName"] === "string"
  );
}

function isDeployResponse(data: unknown): data is DeployResponse {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>)["projectUrl"] === "string" &&
    typeof (data as Record<string, unknown>)["deploymentUrl"] === "string"
  );
}

async function triggerCreateRepo(
  projectId: string,
  repoName?: string
): Promise<{ repoUrl: string; repoName: string }> {
  logger.info(`[Artifacts] Triggering repo creation for ${projectId}`);
  const response = await fetch(
    `/api/projects/${projectId}/github/create-repo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoName }),
    }
  );
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = parseErrorMessage(
      data,
      `Repo creation failed (${response.status})`
    );
    throw new Error(message);
  }
  if (!isCreateRepoResponse(data)) {
    throw new Error("Unexpected response from server.");
  }
  logger.info(
    `[Artifacts] Repo created successfully for ${projectId}: ${data.repoUrl}`
  );
  return data;
}

async function triggerDeploy(
  projectId: string
): Promise<{ projectUrl: string; deploymentUrl: string }> {
  logger.info(`[Artifacts] Triggering deployment for ${projectId}`);
  const response = await fetch(`/api/projects/${projectId}/deploy`, {
    method: "POST",
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = parseErrorMessage(
      data,
      `Deployment failed (${response.status})`
    );
    throw new Error(message);
  }
  if (!isDeployResponse(data)) {
    throw new Error("Unexpected response from server.");
  }
  logger.info(
    `[Artifacts] Deployment triggered successfully for ${projectId}: ${data.deploymentUrl}`
  );
  return data;
}
// --- End Helper Functions ---

interface AgentArtifactsProps {
  projectId: string;
  githubRepoUrl: string | null;
  githubRepoName: string | null;
  vercelProjectUrl: string | null;
  vercelDeploymentUrl: string | null;
  agentStatus: string | null;
  isGitHubConnected: boolean;
  // isVercelConnected prop REMOVED
  onActionComplete: () => void;
}

const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function AgentArtifacts({
  projectId,
  githubRepoUrl,
  githubRepoName,
  vercelProjectUrl,
  vercelDeploymentUrl,
  agentStatus,
  isGitHubConnected,
  onActionComplete,
}: AgentArtifactsProps) {
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRepo = async () => {
    setIsCreatingRepo(true);
    setError(null);
    try {
      await triggerCreateRepo(projectId);
      onActionComplete();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Repository creation failed.";
      logger.error("[Artifacts] Create repo error:", err instanceof Error ? err : undefined);
      setError(message);
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setError(null);
    try {
      await triggerDeploy(projectId);
      onActionComplete();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Deployment trigger failed. Have you configured your Vercel Access Token in the agent's settings?";
      logger.error("[Artifacts] Deploy error:", err instanceof Error ? err : undefined);
      setError(message);
    } finally {
      setIsDeploying(false);
    }
  };

  const isConfiguring =
    agentStatus === "PENDING_USER_INPUT" ||
    agentStatus === "PENDING_CONFIGURATION";

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="p-6 bg-card border border-border rounded-lg shadow-sm space-y-4"
    >
      <h3 className="text-lg font-semibold text-foreground mb-3">
        Project Artifacts & Deployment
      </h3>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-md text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* GitHub Section */}
      <div className="pt-4 border-t border-border">
        <h4 className="text-md font-semibold text-foreground mb-2 flex items-center gap-2">
          <Github className="w-5 h-5" /> GitHub Repository
        </h4>
        {!isGitHubConnected ? (
          <p className="text-sm text-muted-foreground">
            Connect your GitHub account in profile settings to create a
            repository.
          </p>
        ) : githubRepoUrl ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-600 dark:text-green-400 truncate pr-2">
              ✅ Repo: {githubRepoName || "Created"}
            </p>
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-primary hover:underline"
            >
              View on GitHub <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Create a private GitHub repository for your project code.
            </p>
            <motion.button
              onClick={() => {
                void handleCreateRepo();
              }}
              disabled={isCreatingRepo}
              whileHover={{ scale: isCreatingRepo ? 1 : 1.03 }}
              whileTap={{ scale: isCreatingRepo ? 1 : 0.98 }}
              className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
            >
              {isCreatingRepo ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Github className="w-4 h-4 mr-2" />
              )}
              {isCreatingRepo ? "Creating Repo..." : "Create GitHub Repo"}
            </motion.button>
          </div>
        )}
      </div>

      {/* Vercel Deployment Section */}
      <div className="pt-4 border-t border-border">
        <h4 className="text-md font-semibold text-foreground mb-2 flex items-center gap-2">
          <Box className="w-5 h-5" /> Vercel Deployment
        </h4>
        {/* *** UPDATED LOGIC *** */}
        {/* We no longer check isVercelConnected. We just check if the repo exists. */}
        {!githubRepoUrl ? (
          <p className="text-sm text-muted-foreground italic">
            Create a GitHub repository first to enable Vercel deployment.
          </p>
        ) : (
          <div>
            {/* Deployment Status/Links */}
            {vercelProjectUrl || vercelDeploymentUrl ? (
              <div className="space-y-1 mb-3 text-sm">
                {vercelProjectUrl && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Project:</span>
                    <a
                      href={vercelProjectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 truncate"
                    >
                      {vercelProjectUrl.replace("https://", "")}{" "}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>
                )}
                {vercelDeploymentUrl && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Latest Deploy:
                    </span>
                    <a
                      href={vercelDeploymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 truncate"
                    >
                      {vercelDeploymentUrl.replace("https://", "")}{" "}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-2">
                Deploy your project&apos;s `main` branch to Vercel.
              </p>
            )}

            {/* Deploy Button */}
            <motion.button
              onClick={() => {
                void handleDeploy();
              }}
              disabled={isDeploying || agentStatus === "EXECUTING" || isConfiguring}
              whileHover={{
                scale: isDeploying || agentStatus === "EXECUTING" ? 1 : 1.03,
              }}
              whileTap={{
                scale: isDeploying || agentStatus === "EXECUTING" ? 1 : 0.98,
              }}
              className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:opacity-90 dark:bg-white dark:text-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
            >
              {isDeploying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4 mr-2"
                  fill="currentColor"
                  viewBox="0 0 75 65"
                >
                  <path d="M37.59.25l36.95 64H.64l36.95-64z"></path>
                </svg>
              )}
              {isDeploying ? "Deploying..." : "Deploy to Vercel"}
            </motion.button>
            {agentStatus === "EXECUTING" && (
              <p className="text-xs text-muted-foreground text-center mt-1">
                Deploy disabled while agent is working.
              </p>
            )}
          </div>
        )}
        {/* *** END UPDATED LOGIC *** */}
      </div>
    </motion.div>
  );
}
