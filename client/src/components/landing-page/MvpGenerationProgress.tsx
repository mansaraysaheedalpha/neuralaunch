// src/components/landing-page/MvpGenerationProgress.tsx
"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "active" | "complete";
}

interface MvpGenerationProgressProps {
  steps: ProgressStep[];
}

export default function MvpGenerationProgress({
  steps,
}: MvpGenerationProgressProps) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <motion.div
          key={step.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center gap-3"
        >
          {/* Icon */}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              step.status === "complete"
                ? "bg-green-500/20 text-green-500"
                : step.status === "active"
                  ? "bg-blue-500/20 text-blue-500"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step.status === "complete" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : step.status === "active" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="text-sm font-semibold">{index + 1}</span>
            )}
          </div>

          {/* Label */}
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                step.status === "complete"
                  ? "text-green-500"
                  : step.status === "active"
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {step.label}
            </p>
          </div>

          {/* Status indicator */}
          {step.status === "active" && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 2, ease: "easeInOut" }}
              className="h-1 bg-blue-500 rounded-full"
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}

// Hook to manage generation progress
export function useGenerationProgress() {
  const defaultSteps: ProgressStep[] = [
    { id: "validate", label: "Validating blueprint data", status: "pending" },
    { id: "parse", label: "AI parsing your blueprint", status: "pending" },
    { id: "models", label: "Generating database models", status: "pending" },
    { id: "components", label: "Creating UI components", status: "pending" },
    { id: "auth", label: "Setting up authentication", status: "pending" },
    { id: "payments", label: "Configuring payments", status: "pending" },
    { id: "package", label: "Packaging your codebase", status: "pending" },
  ];

  const updateStepStatus = (
    steps: ProgressStep[],
    stepId: string,
    status: ProgressStep["status"]
  ): ProgressStep[] => {
    return steps.map((step) =>
      step.id === stepId ? { ...step, status } : step
    );
  };

  const progressSteps = (
    currentStep: number,
    includeAuth: boolean = true,
    includePayments: boolean = true
  ): ProgressStep[] => {
    let steps = [...defaultSteps];

    // Remove auth step if not included
    if (!includeAuth) {
      steps = steps.filter((s) => s.id !== "auth");
    }

    // Remove payments step if not included
    if (!includePayments) {
      steps = steps.filter((s) => s.id !== "payments");
    }

    // Update status based on current step
    return steps.map((step, index) => {
      if (index < currentStep) {
        return { ...step, status: "complete" };
      } else if (index === currentStep) {
        return { ...step, status: "active" };
      }
      return step;
    });
  };

  return {
    defaultSteps,
    updateStepStatus,
    progressSteps,
  };
}
