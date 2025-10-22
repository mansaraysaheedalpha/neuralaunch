// src/components/landing-page/SprintDashboard.tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Task, TaskOutput } from "@prisma/client"; // Import TaskStatus
import TaskCard from "./TaskCard";
import AIAssistantModal from "./AIAssistantModal";
import SprintAnalytics from "./SprintAnalytics";
import SprintAchievements from "./SprintAchievements";
import toast from "react-hot-toast";
import { trackEvent } from "@/lib/analytics";

// Define the expected shape of the data returned by the SWR hook
interface SprintData {
  tasks: Array<Task & { outputs: TaskOutput[] }>;
  // Add other fields returned by /api/sprint/[conversationId] if any
}

// Define the type for API error responses
interface ApiErrorResponse {
  message?: string;
}

// Define the type for the fetcher function's return value
const fetcher = (url: string): Promise<SprintData> =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      // Handle API errors more gracefully with proper typing
      const errorData: unknown = await res.json();
      const typedError = errorData as ApiErrorResponse;
      throw new Error(typedError.message || `API Error: ${res.status}`);
    }
    const data: unknown = await res.json();
    return data as SprintData;
  });

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

  // --- FIX: Use the defined SprintData type for the SWR hook with explicit error typing ---
  const { data, error, mutate } = useSWR<SprintData, Error>(
    `/api/sprint/${conversationId}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  // -----------------------------------------------------------

  const handleStartSprint = async () => {
    setIsStarting(true);
    try {
      const res = await fetch("/api/sprint/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        const errorData: unknown = await res.json();
        const typedError = errorData as ApiErrorResponse;
        throw new Error(typedError.message || "Failed to start sprint.");
      }
      trackEvent("start_validation_sprint", {
        conversationId: conversationId,
      });
      // Re-fetch data after starting
      await mutate(); // Await the mutation to ensure data is updated
    } catch (err: unknown) {
      // Type the error
      toast.error(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/sprint/export/${conversationId}`);
      if (!response.ok) {
        const errorData: unknown = await response.json();
        const typedError = errorData as ApiErrorResponse;
        throw new Error(typedError.message || "Failed to fetch export data.");
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
    } catch (err: unknown) {
      // Type the error
      toast.error(
        err instanceof Error ? err.message : "Failed to export sprint."
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Error state handling remains the same
  if (error) {
    return (
      <div className="text-red-500 p-8">
        Failed to load sprint data. Please refresh.
      </div>
    );
  }
  // Loading state handling remains the same
  if (!data) {
    return <div className="text-center p-8">Loading Sprint Dashboard...</div>;
  }

  // --- FIX: Safely access tasks from typed data ---
  // Default to empty array if data.tasks is somehow undefined/null
  const tasks = data?.tasks ?? [];
  const hasTasks = tasks.length > 0;
  // ------------------------------------------------

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
            // --- FIX: Handle misused promise ---
            <button
              onClick={() => void handleExport()} // Wrap async onClick
              disabled={isExporting}
              className="px-4 py-2 bg-primary/10 text-primary text-sm font-semibold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {isExporting ? "Exporting..." : "Export Report"}
            </button>
            // ---------------------------------
          )}
        </div>
      </div>

      {!hasTasks ? (
        <div className="text-center py-12">
          {/* --- FIX: Handle misused promise --- */}
          <motion.button
            onClick={() => void handleStartSprint()} // Wrap async onClick
            disabled={isStarting}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold shadow-lg hover:opacity-90 disabled:opacity-50"
          >
            {isStarting ? "Parsing Blueprint..." : "Start Your 72-Hour Sprint"}
          </motion.button>
          {/* --------------------------------- */}
          <p className="text-sm text-muted-foreground mt-4">
            This will parse your AI-generated blueprint into actionable tasks.
          </p>
        </div>
      ) : (
        <div>
          <SprintAnalytics conversationId={conversationId} />
          <div className="space-y-4">
            {/* --- FIX: Map over the correctly typed tasks array --- */}
            {tasks.map(
              (
                task // No need for explicit type here, inferred from 'tasks'
              ) => (
                <TaskCard
                  key={task.id}
                  task={task} // Task is already Task & { outputs: TaskOutput[] }
                  onAssistantLaunch={setActiveAssistantTask}
                />
              )
            )}
            {/* -------------------------------------------------- */}
          </div>
          <SprintAchievements conversationId={conversationId} />
        </div>
      )}
    </div>
  );
}
