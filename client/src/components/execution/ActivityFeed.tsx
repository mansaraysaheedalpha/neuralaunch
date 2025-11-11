// src/components/execution/ActivityFeed.tsx
"use client";

import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  FileCode,
  AlertCircle,
  Clock,
  Bot,
} from "lucide-react";

interface ActivityFeedProps {
  projectId: string;
  tasks: any[];
}

export default function ActivityFeed({ projectId, tasks }: ActivityFeedProps) {
  // Sort tasks by most recent activity
  const sortedTasks = [...tasks]
    .filter((t) => t.completedAt || t.createdAt)
    .sort((a, b) => {
      const dateA = new Date(a.completedAt || a.createdAt).getTime();
      const dateB = new Date(b.completedAt || b.createdAt).getTime();
      return dateB - dateA;
    })
    .slice(0, 20); // Show last 20 activities

  if (sortedTasks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No activity yet</p>
        <p className="text-sm mt-1">Activity will appear as agents work</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
      {sortedTasks.map((task, index) => {
        const isComplete = task.status === "COMPLETE";
        const isError = task.status === "FAILED";
        const isInProgress = task.status === "IN_PROGRESS";

        return (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`flex gap-3 p-3 rounded-lg border ${
              isComplete
                ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
                : isError
                ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
                : isInProgress
                ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900"
                : "bg-muted/30 border-border"
            }`}
          >
            {/* Icon */}
            <div className="flex-shrink-0 mt-1">
              {isComplete && (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              )}
              {isError && (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              {isInProgress && (
                <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-pulse" />
              )}
              {!isComplete && !isError && !isInProgress && (
                <Clock className="w-5 h-5 text-muted-foreground" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {task.agentName || "Agent"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {task.title || task.input?.description || "Task executing"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {task.completedAt
                    ? formatDistanceToNow(new Date(task.completedAt), {
                        addSuffix: true,
                      })
                    : task.createdAt
                    ? formatDistanceToNow(new Date(task.createdAt), {
                        addSuffix: true,
                      })
                    : ""}
                </span>
              </div>

              {/* Output Summary */}
              {task.output && (isComplete || isError) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {task.output.filesCreated > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                      <FileCode className="w-3 h-3" />
                      {task.output.filesCreated} files created
                    </span>
                  )}
                  {task.output.filesModified > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                      <FileCode className="w-3 h-3" />
                      {task.output.filesModified} files modified
                    </span>
                  )}
                  {task.output.testsRun > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3" />
                      {task.output.testsRun} tests
                    </span>
                  )}
                </div>
              )}

              {/* Error Message */}
              {isError && task.error && (
                <div className="mt-2 p-2 rounded bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-900">
                  <p className="text-xs text-red-800 dark:text-red-200 line-clamp-2">
                    {task.error}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
