// src/components/execution/AgentGrid.tsx - PROFESSIONAL UI REFACTOR
"use client";

import { motion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  getAgentIcon,
  getAgentColor,
  getAgentDisplayName,
} from "@/lib/agents/agent-types";
import { Task } from "@/types/component-props";

interface AgentGridProps {
  tasks: Task[];
  activeAgents: string[];
  _currentWave: number;
}

export default function AgentGrid({
  tasks,
  activeAgents,
}: AgentGridProps) {
  // Get unique agent names from tasks
  const agents = Array.from(
    new Set(tasks.map((t) => t.agentName).filter((name): name is string => Boolean(name)))
  );

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Bot className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No agents active</p>
        <p className="text-xs mt-1 opacity-70">Agents appear when execution starts</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {agents.map((agentName, index) => {
        const agentTasks = tasks.filter((t) => t.agentName === agentName);
        const isActive = activeAgents.some((a) => a === agentName);
        const completedTasks = agentTasks.filter(
          (t) => t.status === "COMPLETE" || t.status === "completed"
        ).length;
        const totalTasks = agentTasks.length;
        const hasError = agentTasks.some(
          (t) => t.status === "FAILED" || t.status === "failed"
        );
        const isComplete = completedTasks === totalTasks && totalTasks > 0;
        const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        const displayName = getAgentDisplayName(agentName);
        const icon = getAgentIcon(agentName);
        const color = getAgentColor(agentName);

        // Current task being executed
        const currentTask = agentTasks.find(
          (t) => t.status === "IN_PROGRESS" || t.status === "in_progress"
        );
        const currentTaskTitle = currentTask?.title || currentTask?.input?.title;

        // File count
        const filesCreated = agentTasks
          .filter((t) => t.output?.filesCreated)
          .reduce((sum, t) => sum + (t.output?.filesCreated?.length || 0), 0);

        return (
          <motion.div
            key={agentName}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03, duration: 0.2 }}
          >
            <div
              className={`
                relative group rounded-lg border bg-card p-4 transition-all duration-200
                ${isActive ? "ring-2 ring-primary/50 shadow-sm" : "hover:border-muted-foreground/30"}
                ${hasError ? "border-red-300 dark:border-red-800" : ""}
                ${isComplete ? "border-emerald-300 dark:border-emerald-800" : ""}
              `}
            >
              {/* Header Row */}
              <div className="flex items-center gap-3 mb-3">
                {/* Agent Icon */}
                <div
                  className={`
                    flex h-9 w-9 items-center justify-center rounded-lg text-lg
                    bg-gradient-to-br ${color} shadow-sm
                  `}
                >
                  {icon}
                </div>

                {/* Agent Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium truncate">{displayName}</h4>
                  <AgentStatus
                    isComplete={isComplete}
                    isActive={isActive}
                    hasError={hasError}
                  />
                </div>

                {/* Progress Badge */}
                <div className="text-right">
                  <span className="text-xs font-medium">{completedTasks}/{totalTasks}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden mb-3">
                <motion.div
                  className={`h-full ${
                    hasError
                      ? "bg-red-500"
                      : isComplete
                        ? "bg-emerald-500"
                        : "bg-primary"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>

              {/* Footer - Current Task or Stats */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {isActive && currentTaskTitle ? (
                  <p className="truncate flex-1 pr-2">{currentTaskTitle}</p>
                ) : (
                  <span>{Math.round(progress)}% complete</span>
                )}
                {filesCreated > 0 && (
                  <span className="flex-shrink-0">{filesCreated} files</span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AGENT STATUS INDICATOR
// ═══════════════════════════════════════════════════════════════════
function AgentStatus({
  isComplete,
  isActive,
  hasError,
}: {
  isComplete: boolean;
  isActive: boolean;
  hasError: boolean;
}) {
  if (isComplete) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </span>
    );
  }
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
        <AlertCircle className="h-3 w-3" />
        Error
      </span>
    );
  }
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Working
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      Queued
    </span>
  );
}
