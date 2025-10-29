"use client";
import { motion } from "framer-motion";
import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  Play,
  Square,
  CircleHelp,
} from "lucide-react";
import { logger } from "@/lib/logger";
import { StepResult, AgentStatus } from "@/lib/types/agent";

interface AgentControlProps {
  projectId: string;
  currentStepIndex: number | null;
  totalSteps: number;
  currentTaskDescription: string | null;
  agentStatus: AgentStatus | null;
  lastStepResult: StepResult | null;
  onExecuteNextStep: () => Promise<void>;
}

export default function AgentControl({
  projectId,
  currentStepIndex,
  totalSteps,
  currentTaskDescription,
  agentStatus,
  lastStepResult,
  onExecuteNextStep,
}: AgentControlProps) {
  // Local loading state is no longer needed, as the `agentStatus` prop is now the source of truth.

  const handleExecuteClick = async () => {
    // The button is disabled when agentStatus is 'EXECUTING',
    // so we don't need to check for isExecuting here.
    try {
      await onExecuteNextStep();
    } catch (error) {
      logger.error(
        "Error triggering execute step:",
        error instanceof Error ? error : undefined
      );
    }
  };

  let buttonText = "Start Building";
  let buttonIcon = <Play className="w-4 h-4 mr-2" />;
  let isButtonDisabled = true;
  let showButton = true;

  const nextStepNumber = (currentStepIndex ?? 0) + 1;

  switch (agentStatus) {
    case "EXECUTING":
      buttonText = "Agent is Working...";
      buttonIcon = <Loader2 className="w-4 h-4 mr-2 animate-spin" />;
      isButtonDisabled = true;
      break;
    case "READY_TO_EXECUTE":
    case "PAUSED_AFTER_STEP":
      buttonText = `Run Step ${nextStepNumber}`;
      buttonIcon = <Play className="w-4 h-4 mr-2" />;
      isButtonDisabled = false;
      break;
    case "ERROR":
      buttonText = `Retry Step ${nextStepNumber}`;
      buttonIcon = <CircleHelp className="w-4 h-4 mr-2" />;
      isButtonDisabled = false;
      break;
    case "COMPLETE":
      buttonText = "All Steps Complete";
      buttonIcon = <CheckCircle className="w-4 h-4 mr-2" />;
      isButtonDisabled = true;
      showButton = false;
      break;
    case "PENDING_USER_INPUT":
      buttonText = "Waiting for Input...";
      buttonIcon = <Square className="w-4 h-4 mr-2" />;
      isButtonDisabled = true;
      break;
    default: // PLANNING or null
      buttonText = "Start Building Process";
      buttonIcon = <Play className="w-4 h-4 mr-2" />;
      isButtonDisabled = true;
      showButton = false;
      break;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-card border border-border rounded-lg shadow-md mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Agent Status</h2>
        {agentStatus && (
          <span
            className={`px-3 py-1 text-xs font-medium rounded-full ${
              agentStatus === "EXECUTING"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse"
                : agentStatus === "PAUSED_AFTER_STEP"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : // ... (rest of the classes)
                  "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
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
                width: `${
                  (Math.min(currentStepIndex, totalSteps) / totalSteps) * 100
                }%`,
              }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
        </div>
      )}

      <div className="mb-4 p-3 bg-muted/50 rounded border border-border min-h-[60px]">
        {agentStatus === "ERROR" && lastStepResult?.errorMessage && (
          <p className="text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            **Error:** {lastStepResult.errorMessage}
          </p>
        )}
        {agentStatus === "PAUSED_AFTER_STEP" && lastStepResult?.summary && (
          <p className="text-sm text-green-700 dark:text-green-300">
            <CheckCircle className="w-4 h-4 inline mr-1" />
            **Step {lastStepResult.taskIndex + 1} Complete:**{" "}
            {lastStepResult.summary}
          </p>
        )}
        {agentStatus !== "ERROR" &&
          agentStatus !== "PAUSED_AFTER_STEP" &&
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
            Waiting for your input in the planner section below...
          </p>
        )}
        {agentStatus === "EXECUTING" && (
          <p className="text-sm text-blue-600 dark:text-blue-300 italic animate-pulse">
            Working on step {nextStepNumber}... Check logs below.
          </p>
        )}
      </div>

      {showButton && (
        <motion.button
          onClick={() => void handleExecuteClick()}
          disabled={isButtonDisabled}
          whileHover={{ scale: isButtonDisabled ? 1 : 1.03 }}
          whileTap={{ scale: isButtonDisabled ? 1 : 0.98 }}
          className={`w-full inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white ${
            agentStatus === "ERROR"
              ? "bg-red-600 hover:bg-red-700"
              : "bg-primary hover:opacity-90"
          } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
        >
          {buttonIcon}
          {buttonText}
        </motion.button>
      )}
    </motion.div>
  );
}
