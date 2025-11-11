// src/components/execution/WaveTimeline.tsx
"use client";

import { motion } from "framer-motion";
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  XCircle,
  Clock 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Wave {
  number: number;
  status: "pending" | "active" | "completed" | "failed";
  tasks?: any[];
  startedAt?: string | Date;
  completedAt?: string | Date;
}

interface WaveTimelineProps {
  waves: Wave[];
  currentWave: number;
}

export default function WaveTimeline({ waves, currentWave }: WaveTimelineProps) {
  if (!waves || waves.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <p>No waves configured yet</p>
        <p className="text-xs mt-1">Waves will appear when orchestration starts</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {waves.map((wave, index) => {
        const isActive = wave.status === "active" || index + 1 === currentWave;
        const isCompleted = wave.status === "completed";
        const isFailed = wave.status === "failed";
        const isPending = wave.status === "pending" || index + 1 > currentWave;

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
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">
                  Wave {wave.number || index + 1}
                </h4>
                {(wave.startedAt || wave.completedAt) && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {wave.completedAt && wave.startedAt
                      ? `${Math.round(
                          (new Date(wave.completedAt).getTime() -
                            new Date(wave.startedAt).getTime()) /
                            1000 / 60
                        )}m`
                      : wave.startedAt
                      ? formatDistanceToNow(new Date(wave.startedAt), {
                          addSuffix: true,
                        })
                      : ""}
                  </span>
                )}
              </div>

              {wave.tasks && wave.tasks.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {wave.tasks.length} task{wave.tasks.length !== 1 ? "s" : ""}
                  {isCompleted && " completed"}
                  {isActive && " in progress"}
                  {isPending && " pending"}
                </div>
              )}

              {/* Task List */}
              {wave.tasks && wave.tasks.length > 0 && isActive && (
                <div className="mt-2 space-y-1">
                  {wave.tasks.slice(0, 3).map((task: any, taskIndex: number) => (
                    <div
                      key={task.id || taskIndex}
                      className="flex items-center gap-2 text-xs"
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          task.status === "COMPLETE"
                            ? "bg-green-500"
                            : task.status === "IN_PROGRESS"
                            ? "bg-blue-500 animate-pulse"
                            : "bg-muted"
                        }`}
                      />
                      <span className="text-muted-foreground truncate">
                        {task.agentName || task.title || "Task"}
                      </span>
                    </div>
                  ))}
                  {wave.tasks.length > 3 && (
                    <div className="text-xs text-muted-foreground ml-4">
                      +{wave.tasks.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Add Quality Check and Deployment as special "waves" */}
      {waves.length > 0 && waves.every((w) => w.status === "completed") && (
        <>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative pl-6 pb-4 border-l-2 border-muted"
          >
            <div className="absolute left-[-9px] top-0 rounded-full p-1 bg-muted text-muted-foreground">
              <Circle className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Quality Check</h4>
              <div className="text-xs text-muted-foreground">
                Testing & code review
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative pl-6"
          >
            <div className="absolute left-[-9px] top-0 rounded-full p-1 bg-muted text-muted-foreground">
              <Circle className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Deployment</h4>
              <div className="text-xs text-muted-foreground">
                Preview & production
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
