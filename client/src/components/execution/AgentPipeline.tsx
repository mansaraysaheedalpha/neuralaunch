// components/execution/AgentPipeline.tsx - PROFESSIONAL UI REFACTOR
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
  Brain,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import Link from "next/link";
import {
  ORCHESTRATOR_PHASES,
  PHASE_METADATA,
  isPlanningPhase,
} from "@/lib/orchestrator/phases";
import { getAgentMetadata } from "@/lib/agents/agent-types";
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

// Generate phase pipeline dynamically from orchestrator phases
const PLANNING_PIPELINE = [
  ORCHESTRATOR_PHASES.ANALYSIS,
  ORCHESTRATOR_PHASES.RESEARCH,
  ORCHESTRATOR_PHASES.VALIDATION,
  ORCHESTRATOR_PHASES.PLANNING,
].map((phaseId) => {
  const metadata = PHASE_METADATA[phaseId];
  return {
    id: phaseId,
    name: String(metadata.name || ""),
    description: String(metadata.description || ""),
    icon: String(metadata.icon || "🤖"),
    color: String(metadata.color || "text-gray-500"),
  };
});

export default function AgentPipeline({
  currentPhase,
  completedPhases,
  projectId,
  currentAgent,
}: AgentPipelineProps) {
  const [showThoughts, setShowThoughts] = useState(false);

  // Real-time thought streaming
  const { thoughts, isLoading, error } = useAgentThoughts(projectId, {
    enabled: isPlanningPhase(currentPhase),
    pollingInterval: 1000,
    maxThoughts: 50,
  });

  // Get current agent metadata
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

  // Only show pipeline during planning phase
  if (
    !isPlanningPhase(currentPhase) &&
    currentPhase !== ORCHESTRATOR_PHASES.PLAN_REVIEW
  ) {
    return null;
  }

  // Calculate progress
  const completedCount = completedPhases.length;
  const totalPhases = PLANNING_PIPELINE.length;
  const progressPercent = Math.round((completedCount / totalPhases) * 100);

  return (
    <Card className="overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-5 py-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">AI Planning</h3>
              <p className="text-xs text-muted-foreground">
                {completedCount}/{totalPhases} phases • {progressPercent}%
              </p>
            </div>
          </div>

          {/* Mini progress bar */}
          <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <CardContent className="p-5">
        {/* ═══════════════════════════════════════════════════════════════════
            CURRENT AGENT STATUS
        ═══════════════════════════════════════════════════════════════════ */}
        {currentAgent &&
          currentPhase !== ORCHESTRATOR_PHASES.PLAN_REVIEW &&
          currentPhase !== ORCHESTRATOR_PHASES.COMPLETE && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-4 rounded-lg border bg-gradient-to-br from-background to-muted/30"
            >
              <div className="flex items-start gap-4">
                {/* Agent Icon */}
                <div
                  className={`
                  flex h-12 w-12 items-center justify-center rounded-xl text-2xl
                  bg-gradient-to-br ${currentAgentColor} shadow-sm
                `}
                >
                  {currentAgentIcon}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Agent Name + Status */}
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold">{currentAgent.name}</h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Working
                    </span>
                  </div>

                  {/* Latest Thought */}
                  {latestThought ? (
                    <motion.p
                      key={latestThought.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-muted-foreground line-clamp-2"
                    >
                      {latestThought.message}
                    </motion.p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {currentAgent.description || "Processing..."}
                    </p>
                  )}

                  {/* Processing indicator */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-primary"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.15,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        {/* ═══════════════════════════════════════════════════════════════════
            THOUGHT STREAM (Collapsible)
        ═══════════════════════════════════════════════════════════════════ */}
        {currentAgentThoughts.length > 0 && (
          <div className="mb-5">
            <button
              onClick={() => setShowThoughts(!showThoughts)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
            >
              <span className="font-medium">
                Thought Stream ({currentAgentThoughts.length})
              </span>
              {showThoughts ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            <AnimatePresence>
              {showThoughts && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 p-3 rounded-lg bg-muted/20 max-h-[300px] overflow-y-auto">
                    {isLoading ? (
                      <ThoughtStreamSkeleton />
                    ) : error ? (
                      <p className="text-center text-sm text-red-500 py-4">
                        Failed to load thoughts
                      </p>
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

        {/* ═══════════════════════════════════════════════════════════════════
            PHASE PIPELINE
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2">
          {PLANNING_PIPELINE.map((phase, index) => {
            const isCompleted = completedPhases.includes(phase.id);
            const isCurrent = currentPhase === phase.id;
            const isPending = !isCompleted && !isCurrent;

            return (
              <motion.div
                key={phase.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                  ${isCurrent ? "bg-primary/10 ring-1 ring-primary/30" : ""}
                  ${isCompleted ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
                  ${isPending ? "opacity-50" : ""}
                `}
              >
                {/* Status Icon */}
                <PhaseStatusIcon
                  isCompleted={isCompleted}
                  isCurrent={isCurrent}
                  isPending={isPending}
                />

                {/* Phase Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{phase.icon}</span>
                    <span
                      className={`text-sm font-medium ${
                        isCompleted
                          ? "text-emerald-700 dark:text-emerald-300"
                          : isCurrent
                            ? "text-primary"
                            : "text-muted-foreground"
                      }`}
                    >
                      {phase.name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {phase.description}
                  </p>
                </div>

                {/* Status Badge */}
                <PhaseStatusBadge
                  isCompleted={isCompleted}
                  isCurrent={isCurrent}
                />
              </motion.div>
            );
          })}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            COMPLETION BANNER
        ═══════════════════════════════════════════════════════════════════ */}
        {currentPhase === ORCHESTRATOR_PHASES.PLAN_REVIEW && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                    Planning Complete
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Ready for your review
                  </p>
                </div>
              </div>
              <Link href={`/projects/${projectId}/plan`}>
                <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  <FileText className="h-4 w-4" />
                  Review
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PHASE STATUS ICON
// ═══════════════════════════════════════════════════════════════════
function PhaseStatusIcon({
  isCompleted,
  isCurrent,
  isPending,
}: {
  isCompleted: boolean;
  isCurrent: boolean;
  isPending: boolean;
}) {
  if (isCompleted) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (isCurrent) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE STATUS BADGE
// ═══════════════════════════════════════════════════════════════════
function PhaseStatusBadge({
  isCompleted,
  isCurrent,
}: {
  isCompleted: boolean;
  isCurrent: boolean;
}) {
  if (isCompleted) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
        Done
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
        Active
      </span>
    );
  }
  return null;
}
