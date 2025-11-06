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
  ExternalLink,
  ListChecks, // 👈 1. IMPORTED ListChecks ICON
} from "lucide-react";
import { logger } from "@/lib/logger";
// 👈 2. IMPORTED THE FULL, DETAILED TYPES
import type {
  ActionableTask,
  Question,
  StepResult,
} from "@/types/agent-schemas";
import PlanViewerModal from "./PlanViewerModal"; // 👈 3. IMPORTED THE NEW MODAL
import AgentPlanner from "./AgentPlanner"; // 👈 4. IMPORTED THE PLANNER

interface AgentControlProps {
  currentStepIndex: number | null;
  totalSteps: number;
  currentTaskDescription: string | null;
  agentStatus: string | null;
  lastStepResult: StepResult | null;
  onExecuteNextStep: () => Promise<void>;

  // 👇 5. ADDED THESE TWO PROPS
  fullPlan: ActionableTask[] | null;
  questions: Question[] | null;
}

export default function AgentControl({
  currentStepIndex,
  totalSteps,
  currentTaskDescription,
  agentStatus,
  lastStepResult,
  onExecuteNextStep,
  fullPlan, // 👈 6. RECEIVING THE PROP
  questions, // 👈 6. RECEIVING THE PROP
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

  // --- (Your button state logic is perfect, no changes) ---
  let buttonText = "Start Building";
  let buttonIcon = <Play className="w-4 h-4 mr-2" />;
  let isButtonDisabled = true;
  let showButton = true;
  let buttonClassName = "bg-primary hover:opacity-90";
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
    buttonText = `Continue to Step ${nextStepNumber}`;
    buttonIcon = <Play className="w-4 h-4 mr-2" />;
    isButtonDisabled = false;
    buttonClassName = "bg-green-600 hover:bg-green-700";
  } else if (agentStatus === "ERROR") {
    buttonText = `Retry Step ${nextStepNumber}`;
    buttonIcon = <CircleHelp className="w-4 h-4 mr-2" />;
    isButtonDisabled = false;
    buttonClassName = "bg-red-600 hover:bg-red-700";
  } else if (agentStatus === "COMPLETE") {
    buttonText = "All Steps Complete";
    buttonIcon = <CheckCircle className="w-4 h-4 mr-2" />;
    isButtonDisabled = true;
    showButton = false;
  } else if (
    agentStatus === "PENDING_USER_INPUT" ||
    agentStatus === "PENDING_CONFIGURATION"
  ) {
    buttonText = "Waiting for Input...";
    buttonIcon = <Square className="w-4 h-4 mr-2" />;
    isButtonDisabled = true;
  } else {
    buttonText = "Agent is Planning...";
    buttonIcon = <Loader2 className="w-4 h-4 mr-2 animate-spin" />;
    isButtonDisabled = true;
    showButton = true;
  }
  // --- (End of button logic) ---

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-card border border-border rounded-lg shadow-md mb-6"
    >
      {/* (Your header and progress bar - no changes) */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Agent Status</h2>
        {agentStatus && (
          <span
            className={`px-3 py-1 text-xs font-medium rounded-full ${
              agentStatus === "EXECUTING"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse"
                : agentStatus === "PAUSED_AFTER_STEP"
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : agentStatus === "PAUSED_FOR_PREVIEW"
                    ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
                    : agentStatus === "ERROR"
                      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      : agentStatus === "COMPLETE"
                        ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                        : agentStatus === "READY_TO_EXECUTE"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          : agentStatus === "PENDING_CONFIGURATION"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                            : agentStatus === "PENDING_USER_INPUT"
                              ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            }`}
          >
            {agentStatus.replace(/_/g, " ")}
          </span>
        )}
      </div>

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

      {/* (Your status/error message box - no changes) */}
      <div className="mb-4 p-3 bg-muted/50 rounded border border-border min-h-[60px]">
        {agentStatus === "ERROR" && lastStepResult?.errorMessage && (
          <p className="text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            <strong>Error:</strong> {lastStepResult.errorMessage}
          </p>
        )}
        {(agentStatus === "PAUSED_AFTER_STEP" ||
          agentStatus === "PAUSED_FOR_PREVIEW") &&
          lastStepResult?.summary && (
            <div className="space-y-3">
              <p className="text-sm text-green-700 dark:text-green-300">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                <strong>
                  Step {lastStepResult.taskIndex + 1} Complete:
                </strong>{" "}
                {lastStepResult.summary.replace(
                  /View \[Pull Request & Preview\]\(.*\)/,
                  ""
                )}
              </p>
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
        {agentStatus !== "ERROR" &&
          agentStatus !== "PAUSED_AFTER_STEP" &&
          agentStatus !== "PAUSED_FOR_PREVIEW" &&
          agentStatus !== "COMPLETE" &&
          currentTaskDescription && (
            <p className="text-sm text-muted-foreground italic">
              <strong>Next Task:</strong> {currentTaskDescription}
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

      {/* 👇 7. WRAPPED YOUR BUTTONS in a flex container */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Your original "Execute" button */}
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

        {/* 👇 8. THIS IS THE NEW BUTTON + MODAL */}
        <PlanViewerModal
          planComponent={
            <AgentPlanner
              projectId="" // Not needed for a read-only view
              plan={fullPlan}
              questions={null} // Don't show questions
              initialAgentStatus="COMPLETE" // Read-only mode
              onActionComplete={() => {}}
              onExecuteStart={() => {}}
            />
          }
        >
          {/* This is the trigger button that *looks* like a button */}
          <button
            className="w-full inline-flex items-center justify-center px-6 py-3 border border-border bg-card hover:bg-muted rounded-md shadow-sm text-base font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all disabled:opacity-50"
            // Disable button if there's no plan to view yet
            disabled={!fullPlan || fullPlan.length === 0}
          >
            <ListChecks className="w-4 h-4 mr-2" />
            View Full Plan
          </button>
        </PlanViewerModal>
        {/* 👆 8. END OF NEW BUTTON + MODAL */}
      </div>
    </motion.div>
  );
}
