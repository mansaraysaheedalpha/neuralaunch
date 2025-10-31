// src/components/agent/AgentControl.tsx

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  Play,
  Square,
  CircleHelp,
  ExternalLink, // Added for the PR link
} from "lucide-react";
import { logger } from "@/lib/logger";
import type { StepResult } from "@/types/agent"; // This type must include prUrl?: string | null

interface AgentControlProps {
  currentStepIndex: number | null;
  totalSteps: number;
  currentTaskDescription: string | null;
  agentStatus: string | null;
  lastStepResult: StepResult | null;
  onExecuteNextStep: () => Promise<void>;
}

export default function AgentControl({
  currentStepIndex,
  totalSteps,
  currentTaskDescription,
  agentStatus,
  lastStepResult,
  onExecuteNextStep,
}: AgentControlProps) {
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecuteClick = async () => {
    setIsExecuting(true);
    try {
      await onExecuteNextStep();
    } catch (error) {
      logger.error(
        "Error triggering execute step:",
        error instanceof Error ? error : undefined
      );
    } finally {
      setIsExecuting(false);
    }
  };

  // --- Determine button state based on agentStatus ---
  let buttonText = "Start Building";
  let buttonIcon = <Play className="w-4 h-4 mr-2" />;
  let isButtonDisabled = true;
  let showButton = true;
  let buttonClassName = "bg-primary hover:opacity-90"; // Default button color

  const nextStepNumber = (currentStepIndex ?? 0) + 1;

  if (agentStatus === "EXECUTING" || isExecuting) {
    buttonText = "Agent is Working...";
    buttonIcon = <Loader2 className="w-4 h-4 mr-2 animate-spin" />;
    isButtonDisabled = true;
  } else if (agentStatus === "READY_TO_EXECUTE") {
    buttonText = `Run Step ${nextStepNumber}`;
    buttonIcon = <Play className="w-4 h-4 mr-2" />;
    isButtonDisabled = false;
  } else if (
    agentStatus === "PAUSED_AFTER_STEP" ||
    agentStatus === "PAUSED_FOR_PREVIEW"
  ) {
    // This is the new "continue" state
    buttonText = `Continue to Step ${nextStepNumber}`;
    buttonIcon = <Play className="w-4 h-4 mr-2" />;
    isButtonDisabled = false;
    // Use a different color to indicate "approve" or "continue"
    buttonClassName = "bg-green-600 hover:bg-green-700";
  } else if (agentStatus === "ERROR") {
    buttonText = `Retry Step ${nextStepNumber}`;
    buttonIcon = <CircleHelp className="w-4 h-4 mr-2" />;
    isButtonDisabled = false;
    buttonClassName = "bg-red-600 hover:bg-red-700"; // Error color
  } else if (agentStatus === "COMPLETE") {
    buttonText = "All Steps Complete";
    buttonIcon = <CheckCircle className="w-4 h-4 mr-2" />;
    isButtonDisabled = true;
    showButton = false; // Hide button when all done
  } else if (
    agentStatus === "PENDING_USER_INPUT" ||
    agentStatus === "PENDING_CONFIGURATION"
  ) {
    buttonText = "Waiting for Input...";
    buttonIcon = <Square className="w-4 h-4 mr-2" />;
    isButtonDisabled = true;
  } else {
    // Default/Initial state (null or "PLANNING")
    buttonText = "Agent is Planning...";
    buttonIcon = <Loader2 className="w-4 h-4 mr-2 animate-spin" />;
    isButtonDisabled = true;
    showButton = true; // Show planning state
  }

  // --- UI Rendering ---
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-card border border-border rounded-lg shadow-md mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Agent Status</h2>
        {/* Status Badge */}
        {agentStatus && (
          <span
            className={`px-3 py-1 text-xs font-medium rounded-full ${
              agentStatus === "EXECUTING"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse"
                : agentStatus === "PAUSED_AFTER_STEP"
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : // *** NEW STATUS STYLE ***
                    agentStatus === "PAUSED_FOR_PREVIEW"
                    ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
                    : agentStatus === "ERROR"
                      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      : agentStatus === "COMPLETE"
                        ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                        : agentStatus === "READY_TO_EXECUTE"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          : // *** NEW STATUS STYLE ***
                            agentStatus === "PENDING_CONFIGURATION"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                            : agentStatus === "PENDING_USER_INPUT"
                              ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" // Default/Planning
            }`}
          >
            {agentStatus.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Progress */}
      {totalSteps > 0 && currentStepIndex !== null && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>Progress</span>
            <span>
              Step {Math.min(currentStepIndex, totalSteps)} / {totalSteps}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <motion.div
              className="bg-primary h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${(Math.min(currentStepIndex, totalSteps) / totalSteps) * 100}%`,
              }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
        </div>
      )}

      {/* Last Step Summary / Next Task / Error Message */}
      <div className="mb-4 p-3 bg-muted/50 rounded border border-border min-h-[60px]">
        {agentStatus === "ERROR" && lastStepResult?.errorMessage && (
          <p className="text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            **Error:** {lastStepResult.errorMessage}
          </p>
        )}

        {/* *** UPDATED: Combined Pause States & Added PR Link *** */}
        {(agentStatus === "PAUSED_AFTER_STEP" ||
          agentStatus === "PAUSED_FOR_PREVIEW") &&
          lastStepResult?.summary && (
            <div className="space-y-3">
              <p className="text-sm text-green-700 dark:text-green-300">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                **Step {lastStepResult.taskIndex + 1} Complete:**{" "}
                {/* Clean summary just in case it contains markdown link text */}
                {lastStepResult.summary.replace(
                  /View \[Pull Request & Preview\]\(.*\)/,
                  ""
                )}
              </p>

              {/* Show PR Link if it exists */}
              {agentStatus === "PAUSED_FOR_PREVIEW" && lastStepResult.prUrl && (
                <a
                  href={lastStepResult.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gray-800 dark:bg-gray-700 rounded-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Pull Request & Vercel Preview
                </a>
              )}
            </div>
          )}

        {/* Next Task Description */}
        {agentStatus !== "ERROR" &&
          agentStatus !== "PAUSED_AFTER_STEP" &&
          agentStatus !== "PAUSED_FOR_PREVIEW" &&
          agentStatus !== "COMPLETE" &&
          currentTaskDescription && (
            <p className="text-sm text-muted-foreground italic">
              **Next Task:** {currentTaskDescription}
            </p>
          )}

        {agentStatus === "COMPLETE" && (
          <p className="text-sm font-semibold text-purple-600 dark:text-purple-300">
            🎉 All steps completed successfully!
          </p>
        )}

        {agentStatus === "PENDING_USER_INPUT" && (
          <p className="text-sm text-muted-foreground italic">
            Waiting for your input in the planner section...
          </p>
        )}

        {/* *** ADDED: New Status Message *** */}
        {agentStatus === "PENDING_CONFIGURATION" && (
          <p className="text-sm text-amber-600 dark:text-amber-400 italic animate-pulse">
            Please provide the required environment variables...
          </p>
        )}

        {agentStatus === "EXECUTING" && (
          <p className="text-sm text-blue-600 dark:text-blue-300 italic animate-pulse">
            Working on step {nextStepNumber}... Check logs below.
          </p>
        )}
      </div>

      {/* Action Button */}
      {showButton && (
        <motion.button
          onClick={() => void handleExecuteClick()}
          disabled={isButtonDisabled}
          whileHover={{ scale: isButtonDisabled ? 1 : 1.03 }}
          whileTap={{ scale: isButtonDisabled ? 1 : 0.98 }}
          className={`w-full inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white ${buttonClassName} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
        >
          {buttonIcon}
          {buttonText}
        </motion.button>
      )}
    </motion.div>
  );
}
