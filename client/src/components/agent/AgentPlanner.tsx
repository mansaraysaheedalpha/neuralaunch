// src/components/agent/AgentPlanner.tsx

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ListChecks,
  HelpCircle,
  Send,
  Loader2,
  Play,
  Brain,
} from "lucide-react"; // Added Brain icon
import { logger } from "@/lib/logger";
import type { PlanStep, Question } from "@/types/agent"; // Ensure Question type includes 'options' and 'allowAgentDecision'

// --- Types ---
type SubmitAnswersResponse = {
  agentStatus?: string;
  error?: string;
};

// Type guard for API response
function isSubmitAnswersResponse(
  value: unknown
): value is SubmitAnswersResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  // Check types loosely, allowing undefined
  const hasStatus =
    "agentStatus" in obj &&
    (typeof obj.agentStatus === "string" || obj.agentStatus === undefined);
  const hasError =
    "error" in obj &&
    (typeof obj.error === "string" || obj.error === undefined);
  return hasStatus || hasError; // It's valid if it has at least one, or potentially both
}

// Special value to indicate agent should decide
const AGENT_DECISION_MARKER = "__AGENT_DECISION__";

interface AgentPlannerProps {
  projectId: string;
  plan: PlanStep[] | null;
  questions: Question[] | null; // Expects the enhanced Question type
  initialAgentStatus: string | null;
  // Callback now just needs to revalidate data (parent handles status)
  onActionComplete: () => void;
  // Callback to trigger first execution step (used if no questions/config needed)
  onExecuteStart: () => void;
  // Optional: Callback if submitting answers fails
  onSubmissionError?: (error: string) => void;
}

// --- Animation Variants (Keep existing ones) ---
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

// --- Component ---
export default function AgentPlanner({
  projectId,
  plan,
  questions,
  initialAgentStatus,
  onActionComplete, // Renamed from onAnswersSubmit for clarity
  onExecuteStart,
  onSubmissionError,
}: AgentPlannerProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // --- Derived State ---
  const validQuestions = Array.isArray(questions) ? questions : [];
  const showQuestionsSection =
    validQuestions.length > 0 && initialAgentStatus === "PENDING_USER_INPUT";
  const showStartButton = // Show start only if agent is ready and there were no questions/config steps
    !showQuestionsSection && initialAgentStatus === "READY_TO_EXECUTE";

  // Check if all *required* questions are answered (not empty and not agent decision)
  const allRequiredAnswered = validQuestions
    .filter((q) => !q.allowAgentDecision) // Filter for required questions
    .every(
      (q) => answers[q.id]?.trim() && answers[q.id] !== AGENT_DECISION_MARKER
    );

  // Check if all questions have *some* answer (including agent decision)
  const allQuestionsTouched = validQuestions.every(
    (q) => answers[q.id] !== undefined
  );

  const canSubmitAnswers =
    showQuestionsSection && allRequiredAnswered && allQuestionsTouched;

  // --- Event Handlers ---

  // Update answer state (for textareas or selected options)
  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setLocalError(null); // Clear error on input change
  };

  // Handle "Let Agent Decide" button click
  const handleAgentDecision = (questionId: string) => {
    handleAnswerChange(questionId, AGENT_DECISION_MARKER);
  };

  // Submit answers to the backend
  const handleSubmitAnswers = async () => {
    if (!canSubmitAnswers) {
      setLocalError("Please answer all required questions before submitting.");
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);
    logger.info(`Submitting answers for project ${projectId}:`, answers);

    try {
      const res = await fetch(`/api/projects/${projectId}/agent/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      const parsed: unknown = await res.json();

      if (!isSubmitAnswersResponse(parsed)) {
        throw new Error("Invalid response format received from server.");
      }

      if (!res.ok || parsed.error) {
        throw new Error(
          parsed.error || `Failed to submit answers (${res.status})`
        );
      }

      logger.info(
        `Answers submitted successfully for ${projectId}. New status: ${parsed.agentStatus}`
      );
      onActionComplete(); // Notify parent to revalidate data
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error submitting answers.";
      logger.error(
        `Error submitting answers for ${projectId}:`,
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
    onExecuteStart();
  };

  // --- Render Logic ---

  // Only render if there's a plan or questions to show
  if (!plan && !showQuestionsSection) {
    // Could show a loading state if planning hasn't finished yet
    return (
      <div className="p-6 text-center text-muted-foreground italic">
        Waiting for agent plan...
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mb-6 space-y-6"
    >
      {/* Plan Overview (No Changes Needed Here) */}
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

      {/* Enhanced Questions Section */}
      <AnimatePresence>
        {showQuestionsSection && (
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
              The AI agent needs answers before building. For optional choices,
              you can let the agent decide.
            </p>

            {/* Map through questions */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-6" // Increased spacing between questions
            >
              {validQuestions.map((q) => (
                <motion.div key={q.id} variants={fadeIn} className="space-y-2">
                  <label
                    htmlFor={q.id}
                    className="block text-sm font-medium text-foreground"
                  >
                    {q.text}
                    {!q.allowAgentDecision && (
                      <span className="text-red-500 ml-1">*</span>
                    )}{" "}
                    {/* Indicate required */}
                  </label>

                  {/* Render Options or Textarea */}
                  {q.options && q.options.length > 0 ? (
                    // Display Options (e.g., as buttons)
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((option) => (
                        <motion.button
                          key={option}
                          onClick={() => handleAnswerChange(q.id, option)}
                          disabled={
                            isSubmitting ||
                            answers[q.id] === AGENT_DECISION_MARKER
                          }
                          whileHover={{
                            scale:
                              isSubmitting ||
                              answers[q.id] === AGENT_DECISION_MARKER
                                ? 1
                                : 1.03,
                          }}
                          whileTap={{
                            scale:
                              isSubmitting ||
                              answers[q.id] === AGENT_DECISION_MARKER
                                ? 1
                                : 0.98,
                          }}
                          className={`px-4 py-2 text-sm rounded-lg border-2 transition-all ${
                            answers[q.id] === option
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-border bg-background hover:border-primary/50 text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                          }`}
                        >
                          {option}
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    // Display Textarea
                    <textarea
                      id={q.id}
                      rows={2}
                      value={
                        answers[q.id] === AGENT_DECISION_MARKER
                          ? ""
                          : answers[q.id] || ""
                      } // Don't show marker in textarea
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      disabled={
                        isSubmitting || answers[q.id] === AGENT_DECISION_MARKER
                      }
                      className="w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm placeholder:text-muted-foreground/50 disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="Your answer..."
                    />
                  )}

                  {/* "Let Agent Decide" Button */}
                  {q.allowAgentDecision && (
                    <motion.button
                      onClick={() => handleAgentDecision(q.id)}
                      disabled={isSubmitting}
                      whileHover={{ scale: isSubmitting ? 1 : 1.03 }}
                      whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
                      className={`mt-2 flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border transition-all ${
                        answers[q.id] === AGENT_DECISION_MARKER
                          ? "border-amber-500 bg-amber-500/10 text-amber-500 font-semibold"
                          : "border-border bg-muted/50 hover:bg-muted text-muted-foreground disabled:opacity-50"
                      }`}
                    >
                      <Brain className="w-3 h-3" />
                      {answers[q.id] === AGENT_DECISION_MARKER
                        ? "Agent Will Decide"
                        : "Let Agent Decide"}
                    </motion.button>
                  )}
                </motion.div>
              ))}
            </motion.div>

            {localError && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                {localError}
              </p>
            )}

            {/* Submit Button */}
            <motion.button
              onClick={() => void handleSubmitAnswers()}
              disabled={!canSubmitAnswers || isSubmitting}
              whileHover={{
                scale: !canSubmitAnswers || isSubmitting ? 1 : 1.03,
              }}
              whileTap={{ scale: !canSubmitAnswers || isSubmitting ? 1 : 0.98 }}
              className="w-full mt-6 inline-flex items-center justify-center px-6 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

      {/* Start Execution Button (Only if agent is ready) */}
      {showStartButton && (
        <motion.button
          onClick={handleStartExecution}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="w-full inline-flex items-center justify-center px-6 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-all"
        >
          <Play className="w-4 h-4 mr-2" />
          Start Building - Step 1
        </motion.button>
      )}
    </motion.div>
  );
}
