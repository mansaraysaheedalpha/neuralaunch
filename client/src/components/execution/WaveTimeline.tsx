// src/components/execution/WaveTimeline.tsx - PROFESSIONAL UI REFACTOR
"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  ChevronRight,
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
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No waves yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {waves.map((wave, index) => {
        const isActive =
          wave.status === "active" ||
          wave.status === "in_progress" ||
          wave.number === currentWave;
        const isCompleted = wave.status === "completed";
        const isFailed = wave.status === "failed";
        const isPending = wave.status === "pending" || wave.number > currentWave;
        const isExpanded = expandedWaves.has(wave.number);

        const taskCount = (wave.taskCount as number | undefined) || wave.tasks?.length || 0;
        const completedCount =
          (wave.completedCount as number | undefined) ||
          wave.tasks?.filter(
            (t: Task) => t.status === "COMPLETE" || t.status === "completed"
          ).length ||
          0;

        const progress = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;

        return (
          <motion.div
            key={wave.number || index}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            {/* Wave Card */}
            <div
              className={`
                rounded-lg border transition-all duration-200 overflow-hidden
                ${isActive ? "border-primary bg-primary/5" : ""}
                ${isCompleted ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
                ${isFailed ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" : ""}
                ${isPending ? "border-muted bg-muted/20" : ""}
              `}
            >
              {/* Header */}
              <button
                className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                onClick={() => taskCount > 0 && toggleWave(wave.number)}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  <WaveStatusIcon
                    isCompleted={isCompleted}
                    isActive={isActive}
                    isFailed={isFailed}
                    isPending={isPending}
                  />
                </div>

                {/* Wave Info */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Wave {wave.number || index + 1}
                    </span>
                    {taskCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {completedCount}/{taskCount}
                      </span>
                    )}
                  </div>

                  {/* Mini progress bar */}
                  {taskCount > 0 && (
                    <div className="h-1 w-full max-w-[100px] rounded-full bg-muted mt-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isCompleted
                            ? "bg-emerald-500"
                            : isFailed
                              ? "bg-red-500"
                              : "bg-primary"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Time / Expand indicator */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(wave.startedAt || wave.completedAt) && (
                    <span className="text-xs text-muted-foreground">
                      {wave.completedAt && wave.startedAt
                        ? `${Math.round(
                            (new Date(wave.completedAt).getTime() -
                              new Date(wave.startedAt).getTime()) /
                              1000 /
                              60
                          )}m`
                        : wave.startedAt
                          ? formatDistanceToNow(new Date(wave.startedAt), {
                              addSuffix: false,
                            })
                          : ""}
                    </span>
                  )}
                  {taskCount > 0 && (
                    <ChevronRight
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  )}
                </div>
              </button>

              {/* Expanded Task List */}
              <AnimatePresence>
                {isExpanded && wave.tasks && wave.tasks.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-2.5 pt-1 border-t bg-muted/10">
                      <div className="space-y-1">
                        {wave.tasks.map((task: Task, taskIndex: number) => (
                          <TaskItem key={task.id || taskIndex} task={task} />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WAVE STATUS ICON
// ═══════════════════════════════════════════════════════════════════
function WaveStatusIcon({
  isCompleted,
  isActive,
  isFailed,
  isPending,
}: {
  isCompleted: boolean;
  isActive: boolean;
  isFailed: boolean;
  isPending: boolean;
}) {
  if (isCompleted) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (isFailed) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white">
        <XCircle className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (isActive) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-current" />
      </div>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// TASK ITEM
// ═══════════════════════════════════════════════════════════════════
function TaskItem({ task }: { task: Task }) {
  const isComplete = task.status === "COMPLETE" || task.status === "completed";
  const isInProgress = task.status === "IN_PROGRESS" || task.status === "in_progress";
  const isFailed = task.status === "FAILED" || task.status === "failed";

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 transition-colors">
      {/* Status dot */}
      <div
        className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
          isComplete
            ? "bg-emerald-500"
            : isInProgress
              ? "bg-blue-500 animate-pulse"
              : isFailed
                ? "bg-red-500"
                : "bg-muted-foreground/40"
        }`}
      />

      {/* Task title */}
      <span className="text-xs text-muted-foreground truncate flex-1">
        {task.title || task.input?.title || task.agentName || "Task"}
      </span>

      {/* Duration */}
      {typeof task.durationMs === "number" && task.durationMs > 0 && (
        <span className="text-xs text-muted-foreground/60 flex-shrink-0">
          {Math.round(task.durationMs / 1000)}s
        </span>
      )}
    </div>
  );
}
