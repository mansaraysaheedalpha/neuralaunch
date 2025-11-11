// src/components/execution/AgentPipeline.tsx
"use client";

import { motion } from "framer-motion";
import { 
  CheckCircle2, 
  Loader2, 
  Clock,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AgentPipelineProps {
  currentPhase: string;
  completedPhases: string[];
  currentAgent?: {
    name: string;
    description: string;
    icon: string;
  };
}

// Define the phase pipeline
const PHASE_PIPELINE = [
  {
    id: "analysis",
    name: "Analyzer Agent",
    description: "Analyzing requirements",
    icon: "🔍",
  },
  {
    id: "research",
    name: "Research Agent",
    description: "Researching technologies",
    icon: "📚",
  },
  {
    id: "validation",
    name: "Validation Agent",
    description: "Validating feasibility",
    icon: "✅",
  },
  {
    id: "planning",
    name: "Planning Agent",
    description: "Creating execution plan",
    icon: "📋",
  },
];

export default function AgentPipeline({
  currentPhase,
  completedPhases,
  currentAgent,
}: AgentPipelineProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          Agent Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Current Agent Status - Large Card */}
        {currentAgent && currentPhase !== "plan_review" && currentPhase !== "complete" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-6 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-2 border-blue-200 dark:border-blue-800"
          >
            <div className="flex items-start gap-4">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="text-4xl"
              >
                {currentAgent.icon}
              </motion.div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-foreground">
                    {currentAgent.name}
                  </h3>
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                </div>
                <p className="text-muted-foreground">
                  {currentAgent.description}
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                  <div className="flex gap-1">
                    <motion.div
                      className="w-2 h-2 bg-blue-500 rounded-full"
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                    />
                    <motion.div
                      className="w-2 h-2 bg-blue-500 rounded-full"
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.div
                      className="w-2 h-2 bg-blue-500 rounded-full"
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    />
                  </div>
                  <span>Working...</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Phase Pipeline Progress */}
        <div className="space-y-3">
          {PHASE_PIPELINE.map((phase, index) => {
            const isCompleted = completedPhases.includes(phase.id);
            const isCurrent = currentPhase === phase.id;
            const isPending = !isCompleted && !isCurrent;

            return (
              <div key={phase.id}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isCurrent
                      ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                      : isCompleted
                      ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                      : "bg-muted/30"
                  }`}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {isCompleted ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200 }}
                      >
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      </motion.div>
                    ) : isCurrent ? (
                      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    ) : (
                      <Clock className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Agent Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{phase.icon}</span>
                      <span
                        className={`font-semibold ${
                          isCurrent
                            ? "text-blue-700 dark:text-blue-300"
                            : isCompleted
                            ? "text-green-700 dark:text-green-300"
                            : "text-muted-foreground"
                        }`}
                      >
                        {phase.name}
                      </span>
                    </div>
                    <p
                      className={`text-sm ${
                        isPending ? "text-muted-foreground" : "text-foreground/80"
                      }`}
                    >
                      {phase.description}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="flex-shrink-0">
                    {isCompleted && (
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">
                        Complete
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        Active
                      </span>
                    )}
                    {isPending && (
                      <span className="text-xs font-medium text-muted-foreground">
                        Pending
                      </span>
                    )}
                  </div>
                </motion.div>

                {/* Arrow between phases */}
                {index < PHASE_PIPELINE.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowRight
                      className={`w-4 h-4 ${
                        isCompleted
                          ? "text-green-400"
                          : "text-muted-foreground/40"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Completion Message */}
        {(currentPhase === "plan_review" || currentPhase === "complete") && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-200 dark:border-green-800"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎉</span>
              <div>
                <h3 className="font-bold text-green-700 dark:text-green-300">
                  Planning Complete!
                </h3>
                <p className="text-sm text-green-600 dark:text-green-400">
                  Your execution plan is ready for review
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
