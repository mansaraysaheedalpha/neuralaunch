// src/components/agent/AgentReasoningLog.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check, X, Brain } from "lucide-react";

interface AgentReasoningLogProps {
  reasoningSteps: string[];
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.3,
    },
  }),
};

export default function AgentReasoningLog({
  reasoningSteps,
}: AgentReasoningLogProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto p-6 bg-card border border-border rounded-lg shadow-lg"
    >
      <div className="flex items-center gap-3 mb-4">
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Brain className="w-8 h-8 text-primary" />
        </motion.div>
        <h2 className="text-2xl font-semibold text-foreground">
          Agent is Thinking...
        </h2>
      </div>
      <p className="text-muted-foreground mb-6">
        The AI architect is analyzing your blueprint and generating a
        step-by-step plan. This may take a moment.
      </p>
      <div className="space-y-3 h-64 overflow-y-auto pr-2">
        <AnimatePresence>
          {reasoningSteps.map((step, i) => {
            const isLastStep = i === reasoningSteps.length - 1;
            const isError = step.toLowerCase().includes("fail");

            return (
              <motion.div
                key={i}
                custom={i}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                layout
                className="flex items-start gap-3"
              >
                <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                  {isLastStep && !isError ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : isError ? (
                    <X className="w-5 h-5 text-red-500" />
                  ) : (
                    <Check className="w-5 h-5 text-green-500" />
                  )}
                </div>
                <p
                  className={`
                    ${isLastStep ? "text-foreground font-medium" : "text-muted-foreground"}
                    ${isError ? "text-red-500" : ""}
                  `}
                >
                  {step}
                </p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
