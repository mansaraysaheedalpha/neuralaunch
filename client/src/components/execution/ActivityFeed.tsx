// src/components/execution/ActivityFeed.tsx
"use client";

import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import {
  CheckCircle2,
  FileCode,
  AlertCircle,
  Clock,
  Bot,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Task } from "@/types/component-props";

interface ActivityFeedProps {
  projectId: string;
  tasks: Task[];
}

export default function ActivityFeed({ projectId: _projectId, tasks }: ActivityFeedProps) {
  const [filter, setFilter] = useState<
    "all" | "completed" | "failed" | "in_progress"
  >("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [displayCount, setDisplayCount] = useState(20);

  // Sort tasks by most recent activity
  const sortedTasks = [...tasks]
    .filter((t) => t.completedAt || t.createdAt)
    .sort((a, b) => {
      const dateA = new Date((a.completedAt || a.createdAt) as string | Date).getTime();
      const dateB = new Date((b.completedAt || b.createdAt) as string | Date).getTime();
      return dateB - dateA;
    });

  // Apply filters
  const filteredTasks = sortedTasks.filter((task) => {
    // Status filter
    if (filter !== "all") {
      const taskStatus = task.status?.toLowerCase();
      if (
        filter === "completed" &&
        taskStatus !== "complete" &&
        taskStatus !== "completed"
      ) {
        return false;
      }
      if (filter === "failed" && taskStatus !== "failed") {
        return false;
      }
      if (filter === "in_progress" && taskStatus !== "in_progress") {
        return false;
      }
    }

    // Agent filter
    if (agentFilter !== "all" && task.agentName !== agentFilter) {
      return false;
    }

    return true;
  });

  // Limit display count
  const displayedTasks = filteredTasks.slice(0, displayCount);
  const hasMore = filteredTasks.length > displayCount;

  // Get unique agents for filter
  const uniqueAgents = Array.from(
    new Set(tasks.map((t) => t.agentName).filter(Boolean) as string[])
  ).sort();

  const activeFilters = [
    filter !== "all" && filter,
    agentFilter !== "all" && agentFilter,
  ].filter(Boolean);

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
    <div className="space-y-4">
      {/* ✅ NEW: Filter Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span>Filters:</span>
        </div>

        {/* Status Filter */}
        <Select value={filter} onValueChange={(value: string) => setFilter(value as "all" | "completed" | "failed" | "in_progress")}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {/* Agent Filter */}
        {uniqueAgents.length > 1 && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {uniqueAgents.map((agent) => (
                <SelectItem key={agent} value={agent}>
                  {agent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear Filters */}
        {activeFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setFilter("all");
              setAgentFilter("all");
            }}
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}

        {/* Results count */}
        <span className="text-xs text-muted-foreground ml-auto">
          Showing {displayedTasks.length} of {filteredTasks.length}
        </span>
      </div>

      {/* Active Filters Display */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilters.map((filterValue, idx) => (
            <Badge key={idx} variant="secondary" className="text-xs">
              {filterValue}
            </Badge>
          ))}
        </div>
      )}

      {/* Activity List */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
        {displayedTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>No activities match your filters</p>
          </div>
        ) : (
          displayedTasks.map((task, index) => {
            const isComplete =
              task.status === "COMPLETE" || task.status === "completed";
            const isError =
              task.status === "FAILED" || task.status === "failed";
            const isInProgress =
              task.status === "IN_PROGRESS" || task.status === "in_progress";

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
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
                        {task.title ||
                          task.input?.title ||
                          task.input?.description ||
                          "Task executing"}
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
                      {task.output.filesCreated && Array.isArray(task.output.filesCreated) && task.output.filesCreated.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          <FileCode className="w-3 h-3" />
                          {task.output.filesCreated.length} files created
                        </span>
                      )}
                      {task.output.filesModified && Array.isArray(task.output.filesModified) && task.output.filesModified.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                          <FileCode className="w-3 h-3" />
                          {task.output.filesModified.length} files modified
                        </span>
                      )}
                      {task.output.testsRun && typeof task.output.testsRun === 'number' && task.output.testsRun > 0 && (
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
          })
        )}
      </div>

      {/* ✅ NEW: Load More Button */}
      {hasMore && (
        <div className="text-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDisplayCount((prev) => prev + 20)}
          >
            Load More ({filteredTasks.length - displayCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
