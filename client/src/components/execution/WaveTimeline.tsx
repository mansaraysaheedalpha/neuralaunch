// src/components/execution/WaveTimeline.tsx
"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Wave, Task } from "@/types/component-props";

interface WaveWithTasksOverride extends Wave {
  tasks?: Task[];
}

interface WaveTimelineProps {
  waves: WaveWithTasksOverride[];
  currentWave: number;
}

export default function WaveTimeline({
  waves,
  currentWave,
}: WaveTimelineProps) {
  const [expandedWaves, setExpandedWaves] = useState<Set<number>>(
    new Set([currentWave])
  );

  const toggleWave = (waveNumber: number) => {
    setExpandedWaves((prev) => {
      const next = new Set(prev);
      if (next.has(waveNumber)) {
        next.delete(waveNumber);
      } else {
        next.add(waveNumber);
      }
      return next;
    });
  };

  if (!waves || waves.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <p>No waves configured yet</p>
        <p className="text-xs mt-1">
          Waves will appear when orchestration starts
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {waves.map((wave, index) => {
        const isActive =
          wave.status === "active" ||
          wave.status === "in_progress" ||
          wave.number === currentWave;
        const isCompleted = wave.status === "completed";
        const isFailed = wave.status === "failed";
        const isPending =
          wave.status === "pending" || wave.number > currentWave;
        const isExpanded = expandedWaves.has(wave.number);

        const taskCount = wave.taskCount || wave.tasks?.length || 0;
        const completedCount =
          wave.completedCount ||
          wave.tasks?.filter(
            (t: Task) => t.status === "COMPLETE" || t.status === "completed"
          ).length ||
          0;

        return (
          <motion.div
            key={wave.number || index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`relative pl-6 pb-4 ${
              index < waves.length - 1 ? "border-l-2" : ""
            } ${
              isCompleted
                ? "border-green-500"
                : isActive
                  ? "border-blue-500"
                  : "border-muted"
            }`}
          >
            {/* Status Icon */}
            <div
              className={`absolute left-[-9px] top-0 rounded-full p-1 ${
                isCompleted
                  ? "bg-green-500 text-white"
                  : isActive
                    ? "bg-blue-500 text-white"
                    : isFailed
                      ? "bg-red-500 text-white"
                      : "bg-muted text-muted-foreground"
              }`}
            >
              {isCompleted && <CheckCircle2 className="w-4 h-4" />}
              {isActive && <Loader2 className="w-4 h-4 animate-spin" />}
              {isFailed && <XCircle className="w-4 h-4" />}
              {isPending && <Circle className="w-4 h-4" />}
            </div>

            {/* Wave Info */}
            <div className="space-y-1">
              <div
                className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded p-1 -m-1"
                onClick={() => taskCount > 0 && toggleWave(wave.number)}
              >
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">
                    Wave {wave.number || index + 1}
                  </h4>
                  {taskCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({completedCount}/{taskCount})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(wave.startedAt || wave.completedAt) && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {wave.completedAt && wave.startedAt
                        ? `${Math.round(
                            (new Date(wave.completedAt).getTime() -
                              new Date(wave.startedAt).getTime()) /
                              1000 /
                              60
                          )}m`
                        : wave.startedAt
                          ? formatDistanceToNow(new Date(wave.startedAt), {
                              addSuffix: true,
                            })
                          : ""}
                    </span>
                  )}
                  {taskCount > 0 && (
                    <>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Task Status Summary */}
              {!isExpanded && taskCount > 0 && (
                <div className="text-xs text-muted-foreground">
                  {taskCount} task{taskCount !== 1 ? "s" : ""}
                  {isCompleted && " completed"}
                  {isActive && " in progress"}
                  {isPending && " pending"}
                </div>
              )}

              {/* ✅ FIX: Expandable Task List - Show all tasks when expanded */}
              {isExpanded && wave.tasks && wave.tasks.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 space-y-1 overflow-hidden"
                >
                  {wave.tasks.map((task: Task, taskIndex: number) => (
                    <div
                      key={task.id || taskIndex}
                      className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/50"
                    >
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          task.status === "COMPLETE" ||
                          task.status === "completed"
                            ? "bg-green-500"
                            : task.status === "IN_PROGRESS" ||
                                task.status === "in_progress"
                              ? "bg-blue-500 animate-pulse"
                              : task.status === "FAILED" ||
                                  task.status === "failed"
                                ? "bg-red-500"
                                : "bg-muted"
                        }`}
                      />
                      <span className="text-muted-foreground truncate flex-1">
                        {task.title ||
                          task.input?.title ||
                          task.agentName ||
                          "Task"}
                      </span>
                      {task.durationMs && (
                        <span className="text-muted-foreground">
                          {Math.round(task.durationMs / 1000)}s
                        </span>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Collapsed view - show first 3 tasks */}
              {!isExpanded &&
                wave.tasks &&
                wave.tasks.length > 0 &&
                isActive && (
                  <div className="mt-2 space-y-1">
                    {wave.tasks
                      .slice(0, 3)
                      .map((task: Task, taskIndex: number) => (
                        <div
                          key={task.id || taskIndex}
                          className="flex items-center gap-2 text-xs"
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              task.status === "COMPLETE" ||
                              task.status === "completed"
                                ? "bg-green-500"
                                : task.status === "IN_PROGRESS" ||
                                    task.status === "in_progress"
                                  ? "bg-blue-500 animate-pulse"
                                  : "bg-muted"
                            }`}
                          />
                          <span className="text-muted-foreground truncate">
                            {task.title ||
                              task.input?.title ||
                              task.agentName ||
                              "Task"}
                          </span>
                        </div>
                      ))}
                    {wave.tasks.length > 3 && (
                      <button
                        onClick={() => toggleWave(wave.number)}
                        className="text-xs text-primary hover:underline ml-4"
                      >
                        +{wave.tasks.length - 3} more
                      </button>
                    )}
                  </div>
                )}
            </div>
          </motion.div>
        );
      })}

      {/* ✅ FIX: REMOVED HARDCODED Quality Check and Deployment phases
          These should come from the waves array if they exist, not hardcoded */}
    </div>
  );
}
