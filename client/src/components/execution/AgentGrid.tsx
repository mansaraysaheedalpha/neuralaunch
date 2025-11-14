// src/components/execution/AgentGrid.tsx
"use client";

import { motion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  FileCode,
  FilePlus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAgentMetadata,
  getAgentIcon,
  getAgentColor,
  getAgentDisplayName,
} from "@/lib/agents/agent-types";
import { Task } from "@/types/component-props";

interface AgentGridProps {
  tasks: Task[];
  activeAgents: string[];
  currentWave: number;
}

export default function AgentGrid({
  tasks,
  activeAgents,
  currentWave,
}: AgentGridProps) {
  // ✅ FIX #1: Correct the reduce bug (was returning {} instead of acc)
  const agentTasks = tasks.reduce((acc: Record<string, Task[]>, task) => {
    const agentKey = task.agentName?.toLowerCase() || "unknown";
    if (!acc[agentKey]) acc[agentKey] = [];
    acc[agentKey].push(task);
    return acc; // ✅ FIXED: Was returning {} before!
  }, {});

  // Get unique agent names from tasks
  const agents = Array.from(
    new Set(tasks.map((t) => t.agentName).filter((name): name is string => Boolean(name)))
  );

  if (agents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No agents active yet</p>
        <p className="text-sm mt-1">
          Agents will appear when tasks start executing
        </p>
      </div>
    );
  }

  // ✅ FIX #2: Dynamic grid based on agent count
  const gridColsClass =
    agents.length === 1
      ? "grid-cols-1"
      : agents.length === 2
        ? "grid-cols-1 md:grid-cols-2"
        : agents.length <= 4
          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
          : agents.length <= 6
            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className={`grid ${gridColsClass} gap-4`}>
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
        const progress =
          totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        // ✅ FIX #3: Use dynamic agent metadata
        const metadata = getAgentMetadata(agentName);
        const displayName = getAgentDisplayName(agentName);
        const icon = getAgentIcon(agentName);
        const color = getAgentColor(agentName);

        // Fallback for unknown agents
        const agentInfo = metadata || {
          icon: "🤖",
          emoji: "🤖",
          color: "from-gray-500 to-slate-500",
          displayName: agentName,
          category: "execution" as const,
          description: "AI Agent",
        };

        return (
          <motion.div
            key={agentName}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card
              className={`relative overflow-hidden ${
                isActive
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : ""
              } ${hasError ? "border-destructive" : ""}`}
            >
              {/* Gradient Background */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${color} opacity-5`}
              />

              <CardContent className="pt-6 pb-4 relative">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg bg-gradient-to-br ${color}`}
                    >
                      <span className="text-xl">{icon}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{displayName}</h3>
                      <div className="flex items-center gap-1 mt-1">
                        {completedTasks === totalTasks && totalTasks > 0 ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span className="text-xs text-green-600 dark:text-green-400">
                              Complete
                            </span>
                          </>
                        ) : isActive ? (
                          <>
                            <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                            <span className="text-xs text-blue-600 dark:text-blue-400">
                              Active
                            </span>
                          </>
                        ) : hasError ? (
                          <>
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span className="text-xs text-red-600 dark:text-red-400">
                              Error
                            </span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              Waiting
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                {totalTasks > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full bg-gradient-to-r ${color}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileCode className="w-3 h-3" />
                    <span>
                      {completedTasks}/{totalTasks} tasks
                    </span>
                  </div>
                  {agentTasks.some((t) => t.output?.filesCreated) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FilePlus className="w-3 h-3" />
                      <span>
                        {agentTasks
                          .filter((t) => t.output?.filesCreated)
                          .reduce(
                            (sum, t) => sum + (t.output?.filesCreated?.length || 0),
                            0
                          )}{" "}
                        files
                      </span>
                    </div>
                  )}
                </div>

                {/* Current Task */}
                {isActive &&
                  agentTasks.some(
                    (t) =>
                      t.status === "IN_PROGRESS" || t.status === "in_progress"
                  ) && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {agentTasks.find(
                          (t) =>
                            t.status === "IN_PROGRESS" ||
                            t.status === "in_progress"
                        )?.title ||
                          agentTasks.find(
                            (t) =>
                              t.status === "IN_PROGRESS" ||
                              t.status === "in_progress"
                          )?.input?.title ||
                          "Working..."}
                      </p>
                    </div>
                  )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
