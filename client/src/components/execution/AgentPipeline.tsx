// src/components/execution/AgentPipeline.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  Loader2, 
  Clock,
  ArrowRight,
  Brain,
  ChevronDown,
  ChevronUp,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Thought {
  id: string;
  agentName: string;
  projectId: string;
  type: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface AgentPipelineProps {
  currentPhase: string;
  completedPhases: string[];
  projectId?: string;
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
  projectId,
  currentAgent,
}: AgentPipelineProps) {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [showThoughts, setShowThoughts] = useState(true);
  const [isPolling, setIsPolling] = useState(false);

  // Fetch thoughts from API
  useEffect(() => {
    if (!projectId) return;

    const fetchThoughts = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/thoughts`);
        if (response.ok) {
          const data = await response.json();
          setThoughts(data.thoughts || []);
        }
      } catch (error) {
        console.error("Failed to fetch thoughts:", error);
      }
    };

    // Initial fetch
    fetchThoughts();

    // Poll for new thoughts while agent is active
    if (currentPhase !== "plan_review" && currentPhase !== "complete") {
      setIsPolling(true);
      const interval = setInterval(fetchThoughts, 2000); // Poll every 2 seconds
      return () => {
        clearInterval(interval);
        setIsPolling(false);
      };
    } else {
      setIsPolling(false);
    }
  }, [projectId, currentPhase]);

  // Get thoughts for current agent
  const currentAgentThoughts = thoughts.filter(
    (t) => t.agentName === currentAgent?.name || 
           t.agentName === PHASE_PIPELINE.find(p => p.id === currentPhase)?.name.replace(" Agent", "")
  );

  // Get the most recent thought
  const latestThought = currentAgentThoughts[currentAgentThoughts.length - 1];

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
                
                {/* Current thought display */}
                {latestThought && (
                  <motion.div
                    key={latestThought.id}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 flex items-start gap-2 text-sm text-blue-600 dark:text-blue-400"
                  >
                    <Brain className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="flex-1">{latestThought.message}</span>
                  </motion.div>
                )}
                
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

        {/* Thought Process Section */}
        {currentAgentThoughts.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowThoughts(!showThoughts)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              <Brain className="w-4 h-4" />
              <span>Thought Process ({currentAgentThoughts.length})</span>
              {showThoughts ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            
            <AnimatePresence>
              {showThoughts && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-2 max-h-64 overflow-y-auto rounded-lg bg-muted/30 p-3"
                >
                  {currentAgentThoughts.map((thought, index) => (
                    <motion.div
                      key={thought.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="text-muted-foreground mt-0.5">
                        {getThoughtIcon(thought.type)}
                      </span>
                      <div className="flex-1">
                        <span className="text-foreground/80">{thought.message}</span>
                        {thought.metadata && Object.keys(thought.metadata).length > 0 && (
                          <div className="text-muted-foreground mt-1 text-[10px]">
                            {formatMetadata(thought.metadata)}
                          </div>
                        )}
                      </div>
                      <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                        {formatTime(thought.timestamp)}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
            <div className="flex items-center justify-between">
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
              {currentPhase === "plan_review" && projectId && (
                <Link href={`/projects/${projectId}/plan`}>
                  <Button className="bg-green-600 hover:bg-green-700">
                    <FileText className="w-4 h-4 mr-2" />
                    View & Edit Plan
                  </Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper function to get icon for thought type
function getThoughtIcon(type: string): string {
  const icons: Record<string, string> = {
    starting: "🚀",
    thinking: "🤔",
    accessing: "🔌",
    analyzing: "📊",
    deciding: "💡",
    executing: "⚙️",
    completing: "✅",
    error: "❌",
  };
  return icons[type] || "💭";
}

// Helper function to format metadata
function formatMetadata(metadata: Record<string, any>): string {
  const entries = Object.entries(metadata).filter(([key]) => !key.includes("error") && !key.includes("stack"));
  if (entries.length === 0) return "";
  
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(", ");
}

// Helper function to format timestamp
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}
