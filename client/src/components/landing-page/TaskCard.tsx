// src/components/landing-page/TaskCard.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Task, TaskOutput } from "@prisma/client";
import toast from "react-hot-toast"; // NEW: Import toast

interface TaskCardProps {
  task: Task & { outputs: TaskOutput[] };
  onUpdate: () => void;
  onAssistantLaunch: (task: Task) => void;
}

export default function TaskCard({
  task,
  onUpdate,
  onAssistantLaunch,
}: TaskCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusChange = async (newStatus: "COMPLETE" | "NOT_STARTED") => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/sprint/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error("Failed to update task.");

      const { newAchievements } = await response.json();

      if (newStatus === "COMPLETE") {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

        // NEW: Display toast notifications for each new achievement
        if (newAchievements && newAchievements.length > 0) {
          newAchievements.forEach((ach: any, index: number) => {
            setTimeout(() => {
              toast.success(
                (t) => (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏆</span>
                    <div>
                      <p className="font-bold">{ach.title}</p>
                      <p className="text-sm">{ach.description}</p>
                    </div>
                  </div>
                ),
                { duration: 5000 }
              );
            }, index * 1000); // Stagger notifications
          });
        }
      }
      onUpdate();
    } catch (error) {
      alert("Failed to update task status.");
    } finally {
      setIsUpdating(false);
    }
  };

  const isCompleted = task.status === "COMPLETE";
  const assistantName = task.aiAssistantType
    ?.replace(/_/g, " ")
    .replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="p-5 bg-card border border-border rounded-xl transition-all"
    >
      <div className="flex items-start gap-4">
        <button
          onClick={() =>
            handleStatusChange(isCompleted ? "NOT_STARTED" : "COMPLETE")
          }
          disabled={isUpdating}
          className="flex-shrink-0 mt-1"
        >
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isCompleted ? "bg-primary border-primary" : "border-border group-hover:border-primary"}`}
          >
            {isCompleted && (
              <svg
                className="w-4 h-4 text-primary-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            )}
          </div>
        </button>

        <div className="flex-1 min-w-0">
          <p
            className={`font-semibold text-foreground ${isCompleted ? "line-through text-muted-foreground" : ""}`}
          >
            {task.title}: {task.description}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {task.timeEstimate}
          </p>
        </div>

        <div className="flex-shrink-0">
          {task.aiAssistantType ? (
            <button
              onClick={() => onAssistantLaunch(task)}
              className="px-4 py-2 bg-primary/10 text-primary text-sm font-semibold rounded-lg hover:bg-primary/20 transition-colors"
            >
              {/* THIS IS THE FIX */}
              🤖 Launch {assistantName}
            </button>
          ) : (
            <span className="px-4 py-2 text-muted-foreground text-sm font-semibold">
              👤 Manual Task
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
