// src/components/landing-page/SprintDashboard.tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Task, TaskOutput } from "@prisma/client";
import TaskCard from "./TaskCard";
import AIAssistantModal from "./AIAssistantModal";
import SprintAnalytics from "./SprintAnalytics";
import SprintAchievements from "./SprintAchievements"; // NEW: Import the achievements component

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function SprintDashboard({
  conversationId,
}: {
  conversationId: string;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeAssistantTask, setActiveAssistantTask] = useState<Task | null>(
    null
  );

  const { data, error, mutate } = useSWR(
    `/api/sprint/${conversationId}`,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  const handleStartSprint = async () => {
    setIsStarting(true);
    try {
      const res = await fetch("/api/sprint/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw new Error("Failed to start sprint.");
      mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/sprint/export/${conversationId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch export data.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ideaspark-report-${conversationId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to export sprint.");
    } finally {
      setIsExporting(false);
    }
  };

  if (error)
    return (
      <div className="text-red-500">
        Failed to load sprint data. Please refresh.
      </div>
    );
  if (!data)
    return <div className="text-center p-8">Loading Sprint Dashboard...</div>;

  const { tasks = [] } = data;
  const hasTasks = tasks.length > 0;

  return (
    <div>
      <AIAssistantModal
        task={activeAssistantTask}
        onClose={() => setActiveAssistantTask(null)}
      />

      <div className="mb-8 p-6 bg-card border border-border rounded-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">
              🚀 72-Hour Validation Sprint
            </h2>
            <p className="text-muted-foreground mt-2">
              Turn your blueprint into action. Complete these tasks to validate
              your idea.
            </p>
          </div>
          {hasTasks && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-4 py-2 bg-primary/10 text-primary text-sm font-semibold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {isExporting ? "Exporting..." : "Export Report"}
            </button>
          )}
        </div>
      </div>

      {!hasTasks ? (
        <div className="text-center py-12">
          <motion.button
            onClick={handleStartSprint}
            disabled={isStarting}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold shadow-lg hover:opacity-90 disabled:opacity-50"
          >
            {isStarting ? "Parsing Blueprint..." : "Start Your 72-Hour Sprint"}
          </motion.button>
          <p className="text-sm text-muted-foreground mt-4">
            This will parse your AI-generated blueprint into actionable tasks.
          </p>
        </div>
      ) : (
        <div>
          <SprintAnalytics conversationId={conversationId} />

          <div className="space-y-4">
            {tasks.map((task: Task & { outputs: TaskOutput[] }) => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={() => mutate()}
                onAssistantLaunch={setActiveAssistantTask}
              />
            ))}
          </div>

          {/* NEW: Display the achievements section */}
          <SprintAchievements />
        </div>
      )}
    </div>
  );
}
