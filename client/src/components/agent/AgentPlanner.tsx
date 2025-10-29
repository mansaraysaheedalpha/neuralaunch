// src/components/agent/AgentPlanner.tsx (New File)

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ListChecks, HelpCircle, Send, Loader2, Play } from "lucide-react";
import { logger } from "@/lib/logger"; // Or console

// Define the shape of Plan steps and Questions
interface PlanStep {
  task: string;
}
interface Question {
  id: string; // e.g., "tech_stack"
  text: string;
}

type SubmitAnswersResponse = {
  agentStatus?: string;
  error?: string;
};

function isSubmitAnswersResponse(value: unknown): value is SubmitAnswersResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if ("agentStatus" in obj && obj.agentStatus !== undefined && typeof obj.agentStatus !== "string") return false;
  if ("error" in obj && obj.error !== undefined && typeof obj.error !== "string") return false;
  return true;
}

interface AgentPlannerProps {
  projectId: string;
  plan: PlanStep[] | null;
  questions: Question[] | null;
  initialAgentStatus: string | null;
  // Callback when answers are submitted successfully (passes new status)
  onAnswersSubmit: (newStatus: string) => void;
  // Callback to trigger first execution step (used if no questions)
  onExecuteStart: () => void;
  // Optional: Callback if submitting answers fails
  onSubmissionError?: (error: string) => void;
}

// Animation variants
const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

export default function AgentPlanner({
  projectId,
  plan,
  questions,
  initialAgentStatus,
  onAnswersSubmit,
  onExecuteStart,
  onSubmissionError,
}: AgentPlannerProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Determine if all questions have answers
  const allQuestionsAnswered = questions
    ? questions.every((q) => answers[q.id]?.trim())
    : true;
  const showQuestions =
    questions &&
    questions.length > 0 &&
    initialAgentStatus === "PENDING_USER_INPUT";
  const showStartButton =
    (!questions || questions.length === 0) &&
    (initialAgentStatus === "READY_TO_EXECUTE" ||
      initialAgentStatus === "PENDING_USER_INPUT"); // Show start if no questions

  const isExecutingOrComplete =
    initialAgentStatus === "EXECUTING" ||
    initialAgentStatus === "COMPLETE";

  // Update answer state
  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setLocalError(null); // Clear error on input change
  };

  // Submit answers to the backend
  const handleSubmitAnswers = async () => {
    if (!allQuestionsAnswered) {
      setLocalError("Please answer all questions before submitting.");
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/agent/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      const parsed: unknown = await res.json();

      if (!isSubmitAnswersResponse(parsed)) {
        throw new Error(`Invalid response from server`);
      }

      if (!res.ok) {
        throw new Error(
          parsed.error || `Failed to submit answers (${res.status})`
        );
      }

      logger.info(
        `[AgentPlanner] Answers submitted successfully for ${projectId}`
      );
      onAnswersSubmit(parsed.agentStatus || "READY_TO_EXECUTE"); // Notify parent
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error submitting answers.";
      logger.error(
        `[AgentPlanner] Error submitting answers for ${projectId}:`,
        error instanceof Error ? error : undefined
      );
      setLocalError(message);
      if (onSubmissionError) {
        onSubmissionError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger first execution step
  const handleStartExecution = () => {
    // Basic check to prevent accidental double-clicks if parent doesn't disable
    if (initialAgentStatus === "EXECUTING") return;
    onExecuteStart();
  };

  // Only render if there's a plan or questions to show
  if (!plan && !showQuestions) {
    return null; // Or a placeholder/loading state if needed initially
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mb-6 space-y-6"
    >
      {/* Plan Overview */}
      {plan && plan.length > 0 && (
        <motion.div
          variants={fadeIn}
          className="p-6 bg-card border border-border rounded-lg shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              Generated Plan
            </h3>
          </div>
          <motion.ol
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="list-decimal list-inside space-y-2 text-sm text-muted-foreground pl-2"
          >
            {plan.map((step, index) => (
              <motion.li key={index} variants={fadeIn}>
                {step.task}
              </motion.li>
            ))}
          </motion.ol>
        </motion.div>
      )}

      {/* Questions Section */}
      <AnimatePresence>
        {showQuestions && (
          <motion.div
            key="questions-section"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="p-6 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg shadow-sm space-y-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                Clarifying Questions
              </h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              The AI agent needs answers to these questions before building:
            </p>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              {questions.map((q) => (
                <motion.div key={q.id} variants={fadeIn} className="space-y-1">
                  <label
                    htmlFor={q.id}
                    className="block text-sm font-medium text-foreground"
                  >
                    {q.text}
                  </label>
                  <textarea
                    id={q.id}
                    rows={2}
                    value={answers[q.id] || ""}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm placeholder:text-muted-foreground/50 disabled:opacity-60"
                    placeholder="Your answer..."
                  />
                </motion.div>
              ))}
            </motion.div>

            {localError && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                {localError}
              </p>
            )}

            <motion.button
              onClick={() => void handleSubmitAnswers()}
              disabled={!allQuestionsAnswered || isSubmitting}
              whileHover={{
                scale: !allQuestionsAnswered || isSubmitting ? 1 : 1.03,
              }}
              whileTap={{
                scale: !allQuestionsAnswered || isSubmitting ? 1 : 0.98,
              }}
              className="w-full mt-4 inline-flex items-center justify-center px-6 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {isSubmitting
                ? "Submitting Answers..."
                : "Submit Answers & Proceed"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start Execution Button */}
      {showStartButton && (
        <motion.button
          onClick={handleStartExecution}
          // Disable if agent is already executing or done
          disabled={isExecutingOrComplete}
          whileHover={{
            scale: isExecutingOrComplete ? 1 : 1.03,
          }}
          whileTap={{
            scale: isExecutingOrComplete ? 1 : 0.98,
          }}
          className="w-full mt-4 inline-flex items-center justify-center px-6 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Play className="w-4 h-4 mr-2" />
          Start Building - Step 1
        </motion.button>
      )}
    </motion.div>
  );
}
