// components/execution/AgentPipeline.tsx - REFACTORED FOR REAL-TIME THOUGHTS
"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import Link from "next/link";
import {
  ORCHESTRATOR_PHASES,
  PHASE_METADATA,
  isPlanningPhase,
} from "@/lib/orchestrator/phases";
import {
  getAgentMetadata,
} from "@/lib/agents/agent-types";
import { ThoughtStream, ThoughtStreamSkeleton } from "./ThoughtStream";
import { useAgentThoughts } from "@/hooks/useAgentThoughts";

interface AgentPipelineProps {
  currentPhase: string;
  completedPhases: string[];
  projectId: string;
  currentAgent?: {
    name: string;
    description: string;
    icon: string;
  };
}

// ✅ Generate phase pipeline dynamically from orchestrator phases
const PLANNING_PIPELINE = [
  ORCHESTRATOR_PHASES.ANALYSIS,
  ORCHESTRATOR_PHASES.RESEARCH,
  ORCHESTRATOR_PHASES.VALIDATION,
  ORCHESTRATOR_PHASES.PLANNING,
].map((phaseId) => {
  const metadata = PHASE_METADATA[phaseId];
  return {
    id: phaseId,
    name: String(metadata.name || ''),
    description: String(metadata.description || ''),
    icon: String(metadata.icon || '🤖'),
    color: String(metadata.color || 'text-gray-500'),
  };
});

export default function AgentPipeline({
  currentPhase,
  completedPhases,
  projectId,
  currentAgent,
}: AgentPipelineProps) {
  const [showThoughts, setShowThoughts] = useState(true);

  // ✅ Real-time thought streaming with custom hook
  const { thoughts, isLoading, error } = useAgentThoughts(projectId, {
    enabled: isPlanningPhase(currentPhase),
    pollingInterval: 1000, // 1 second
    maxThoughts: 50,
  });

  // Get current agent metadata from centralized types
  const currentAgentMeta = currentAgent
    ? getAgentMetadata(currentAgent.name)
    : null;
  const currentAgentIcon =
    currentAgentMeta?.emoji || currentAgent?.icon || "🤖";
  const currentAgentColor =
    currentAgentMeta?.color || "from-blue-500 to-cyan-500";

  // Filter thoughts for current agent
  const currentAgentThoughts = currentAgent
    ? thoughts.filter(
        (t) =>
          t.agentName === currentAgent.name ||
          t.agentName.toLowerCase().includes(currentAgent.name.toLowerCase())
      )
    : [];

  const latestThought = currentAgentThoughts[currentAgentThoughts.length - 1];

  // ✅ Only show pipeline during planning phase
  if (
    !isPlanningPhase(currentPhase) &&
    currentPhase !== ORCHESTRATOR_PHASES.PLAN_REVIEW
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          AI Planning Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* ✅ Current Agent Status - Large Prominent Card */}
        {currentAgent &&
          currentPhase !== ORCHESTRATOR_PHASES.PLAN_REVIEW &&
          currentPhase !== ORCHESTRATOR_PHASES.COMPLETE && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`
              mb-6 p-6 rounded-lg border-2
              bg-gradient-to-br ${currentAgentColor} bg-opacity-5
              border-blue-200 dark:border-blue-800
              shadow-sm hover:shadow-md transition-shadow
            `}
            >
              <div className="flex items-start gap-4">
                {/* Animated Agent Icon */}
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
                  {currentAgentIcon}
                </motion.div>

                <div className="flex-1">
                  {/* Agent Name & Status */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold text-foreground">
                      {currentAgent.name}
                    </h3>
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>

                  {/* Agent Description */}
                  <p className="text-sm text-muted-foreground">
                    {currentAgent.description}
                  </p>

                  {/* Latest Thought Preview */}
                  {latestThought && (
                    <motion.div
                      key={latestThought.id}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 p-3 rounded-lg bg-white/50 dark:bg-black/20 backdrop-blur-sm"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg mt-0.5">💭</span>
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400 leading-relaxed">
                          {latestThought.message}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* Processing Indicator */}
                  <div className="mt-3 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 bg-blue-500 rounded-full"
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            delay: i * 0.2,
                          }}
                        />
                      ))}
                    </div>
                    <span className="font-medium">Processing...</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        {/* ✅ Real-Time Thought Process Section */}
        {currentAgentThoughts.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowThoughts(!showThoughts)}
              className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors mb-3 group"
            >
              <span className="text-xl group-hover:scale-110 transition-transform">
                💭
              </span>
              <span>Thought Process</span>
              <span className="text-xs text-muted-foreground font-normal">
                ({currentAgentThoughts.length})
              </span>
              {showThoughts ? (
                <ChevronUp className="w-4 h-4 ml-auto" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-auto" />
              )}
            </button>

            <AnimatePresence>
              {showThoughts && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden rounded-lg bg-muted/20 p-3"
                >
                  <div className="max-h-[400px] overflow-y-auto">
                    {isLoading ? (
                      <ThoughtStreamSkeleton />
                    ) : error ? (
                      <div className="text-center py-4 text-red-500 text-sm">
                        <p>Failed to load thoughts</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {error}
                        </p>
                      </div>
                    ) : (
                      <ThoughtStream
                        thoughts={currentAgentThoughts}
                        maxVisible={15}
                        showMetadata={true}
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ✅ Phase Progress Pipeline */}
        <div className="space-y-3">
          {PLANNING_PIPELINE.map((phase, index) => {
            const isCompleted = completedPhases.includes(phase.id);
            const isCurrent = currentPhase === phase.id;
            const isPending = !isCompleted && !isCurrent;

            return (
              <div key={phase.id}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`
                    flex items-center gap-3 p-4 rounded-lg transition-all duration-200
                    ${
                      isCurrent
                        ? "bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-200 dark:border-blue-800 shadow-sm"
                        : isCompleted
                          ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                          : "bg-muted/30 border border-transparent"
                    }
                  `}
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

                  {/* Phase Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{phase.icon}</span>
                      <span
                        className={`font-semibold ${
                          isCurrent
                            ? phase.color
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
                        isPending
                          ? "text-muted-foreground"
                          : "text-foreground/80"
                      }`}
                    >
                      {phase.description}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="flex-shrink-0">
                    {isCompleted && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
                        Complete
                      </span>
                    )}
                    {isCurrent && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                        Active
                      </span>
                    )}
                    {isPending && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        Pending
                      </span>
                    )}
                  </div>
                </motion.div>

                {/* Arrow between phases */}
                {index < PLANNING_PIPELINE.length - 1 && (
                  <div className="flex justify-center py-2">
                    <ArrowRight
                      className={`w-4 h-4 transition-colors ${
                        isCompleted
                          ? "text-green-400"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ✅ Completion Message - Plan Review */}
        {currentPhase === ORCHESTRATOR_PHASES.PLAN_REVIEW && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-5 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-200 dark:border-green-800 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.span
                  className="text-4xl"
                  animate={{
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    repeatDelay: 2,
                  }}
                >
                  🎉
                </motion.span>
                <div>
                  <h3 className="font-bold text-lg text-green-700 dark:text-green-300">
                    Planning Complete!
                  </h3>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Your execution plan is ready for review and approval
                  </p>
                </div>
              </div>
              <Link href={`/projects/${projectId}/plan`}>
                <Button className="bg-green-600 hover:bg-green-700 shadow-sm">
                  <FileText className="w-4 h-4 mr-2" />
                  Review Plan
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
