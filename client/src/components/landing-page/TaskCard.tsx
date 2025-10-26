//src/components/landing-pae/TaskCard.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Task, TaskOutput, TaskStatus } from "@prisma/client";
import { useSWRConfig } from "swr"; // 1. Get the global SWR config hook
import toast from "react-hot-toast";
import confetti from "canvas-confetti";

// Define the type for the API response
interface TaskUpdateResponse {
  newAchievements?: Array<{
    id: string;
    title: string;
    description: string;
  }>;
}

interface TaskCardProps {
  task: Task & { outputs: TaskOutput[] };
  onAssistantLaunch: (task: Task) => void;
}

export default function TaskCard({ task, onAssistantLaunch }: TaskCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const { mutate } = useSWRConfig(); // 2. Get the global mutate function

  const handleStatusChange = (newStatus: TaskStatus) => {
    setIsUpdating(true);

    void (async () => {
      try {
        const res = await fetch(`/api/sprint/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!res.ok) throw new Error("Failed to update task status.");

        // --- THIS IS THE FIX ---
        // 1. Read the response from the API with proper typing
        const data: unknown = await res.json();
        const typedData = data as TaskUpdateResponse;
        const newAchievements = typedData.newAchievements;

        // 2. Only celebrate if the API confirms a new achievement was unlocked
        if (newAchievements && newAchievements.length > 0) {
          void confetti({
            particleCount: 150,
            spread: 90,
            origin: { y: 0.6 },
          });
          const firstAchievement = newAchievements[0];
          if (firstAchievement) {
            toast.success(`Achievement Unlocked: ${firstAchievement.title}`);
          }
        }
        // -----------------------

        // Mutate the data to refresh the UI
        await Promise.all([
          mutate(`/api/sprint/${task.conversationId}`),
          mutate(`/api/achievements?conversationId=${task.conversationId}`),
          mutate(`/api/sprint/analytics/${task.conversationId}`),
        ]);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "An unknown error occurred."
        );
      } finally {
        setIsUpdating(false);
      }
    })();
  };

  const assistantName = task.aiAssistantType
    ?.replace(/_/g, " ")
    .replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );

  const isCompleted = task.status === "COMPLETE";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-6 border rounded-2xl transition-all duration-300 ${
        isCompleted ? "bg-card/50 border-dashed" : "bg-card shadow-sm"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="flex-1">
          <h4
            className={`font-bold text-lg ${isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}
          >
            {task.title}
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            {task.description}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4 sm:mt-0">
          {task.aiAssistantType ? (
            <button
              onClick={() => onAssistantLaunch(task)}
              className="px-4 py-2 bg-primary/10 text-primary text-sm font-semibold rounded-lg hover:bg-primary/20 transition-colors text-center"
            >
              🤖 Launch {assistantName}
            </button>
          ) : (
            <span className="px-4 py-2 text-muted-foreground text-sm font-semibold text-center">
              👤 Manual Task
            </span>
          )}
          <button
            onClick={() =>
              handleStatusChange(isCompleted ? "NOT_STARTED" : "COMPLETE")
            }
            disabled={isUpdating}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
              isCompleted
                ? "bg-muted text-muted-foreground hover:bg-border"
                : "bg-green-500 text-white hover:bg-green-600"
            }`}
          >
            {isUpdating ? "..." : isCompleted ? "Undo" : "Mark as Complete"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
