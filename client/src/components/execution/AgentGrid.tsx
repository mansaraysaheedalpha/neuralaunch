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
  FilePlus 
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface AgentGridProps {
  tasks: any[];
  activeAgents: string[];
  currentWave: number;
}

// Map agent names to display info
const AGENT_INFO: Record<string, { icon: any; color: string; name: string }> = {
  backend: {
    icon: Bot,
    color: "from-blue-500 to-cyan-500",
    name: "Backend Agent",
  },
  frontend: {
    icon: Bot,
    color: "from-purple-500 to-pink-500",
    name: "Frontend Agent",
  },
  infrastructure: {
    icon: Bot,
    color: "from-orange-500 to-red-500",
    name: "Infrastructure Agent",
  },
  testing: {
    icon: Bot,
    color: "from-green-500 to-emerald-500",
    name: "Testing Agent",
  },
  documentation: {
    icon: Bot,
    color: "from-yellow-500 to-amber-500",
    name: "Documentation Agent",
  },
  critic: {
    icon: Bot,
    color: "from-indigo-500 to-purple-500",
    name: "Critic Agent",
  },
  integration: {
    icon: Bot,
    color: "from-teal-500 to-cyan-500",
    name: "Integration Agent",
  },
  deployment: {
    icon: Bot,
    color: "from-rose-500 to-pink-500",
    name: "Deployment Agent",
  },
};

export default function AgentGrid({
  tasks,
  activeAgents,
  currentWave,
}: AgentGridProps) {
  // Group tasks by agent
  const agentTasks = tasks.reduce((acc: Record<string, any[]>, task) => {
    const agentKey = task.agentName?.toLowerCase() || "unknown";
    if (!acc[agentKey]) acc[agentKey] = [];
    acc[agentKey].push(task);
    return {};
  }, {});

  // Get unique agent names from tasks
  const agents = Array.from(
    new Set(tasks.map((t) => t.agentName?.toLowerCase()).filter(Boolean))
  );

  if (agents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No agents active yet</p>
        <p className="text-sm mt-1">Agents will appear when tasks start executing</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map((agentKey, index) => {
        const agentTasks = tasks.filter(
          (t) => t.agentName?.toLowerCase() === agentKey
        );
        const isActive = activeAgents.some((a) =>
          a.toLowerCase().includes(agentKey)
        );
        const completedTasks = agentTasks.filter(
          (t) => t.status === "COMPLETE"
        ).length;
        const totalTasks = agentTasks.length;
        const hasError = agentTasks.some((t) => t.status === "FAILED");
        const progress =
          totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        const info = AGENT_INFO[agentKey] || {
          icon: Bot,
          color: "from-gray-500 to-slate-500",
          name: agentKey.charAt(0).toUpperCase() + agentKey.slice(1) + " Agent",
        };

        const Icon = info.icon;

        return (
          <motion.div
            key={agentKey}
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
                className={`absolute inset-0 bg-gradient-to-br ${info.color} opacity-5`}
              />

              <CardContent className="pt-6 pb-4 relative">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg bg-gradient-to-br ${info.color}`}
                    >
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{info.name}</h3>
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
                        className={`h-full bg-gradient-to-r ${info.color}`}
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
                  {agentTasks.some((t) => t.output) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FilePlus className="w-3 h-3" />
                      <span>
                        {agentTasks
                          .filter((t) => t.output?.filesCreated)
                          .reduce(
                            (sum, t) => sum + (t.output?.filesCreated || 0),
                            0
                          )}{" "}
                        files
                      </span>
                    </div>
                  )}
                </div>

                {/* Current Task */}
                {isActive && agentTasks.some((t) => t.status === "IN_PROGRESS") && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {agentTasks.find((t) => t.status === "IN_PROGRESS")?.title ||
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
