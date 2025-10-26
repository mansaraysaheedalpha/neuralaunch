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
  landingPageId,
}: {
  conversationId: string;
  landingPageId: string;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingMvp, setIsDownloadingMvp] = useState(false);
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
        // Attempt to read error message as text first
        let errorMessage = `Failed to export sprint (Status: ${response.status})`;
        try {
          // Try parsing as JSON if Content-Type suggests it
          if (
            response.headers.get("Content-Type")?.includes("application/json")
          ) {
            const errorData = (await response.json()) as ApiErrorResponse;
            if (errorData.message) errorMessage = errorData.message;
          } else {
            // Otherwise, read as plain text
            const errorText = await response.text();
            if (errorText) errorMessage = errorText; // Use text if available
          }
        } catch (parseError) {
          // If parsing fails either way, stick with the status message
          console.error("Failed to parse error response:", parseError);
        }
        throw new Error(errorMessage);
      }

      // If response is OK, process the PDF blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Extract filename from header if possible, otherwise use default
      const disposition = response.headers.get("Content-Disposition");
      let filename = `neuralaunch-report-${conversationId}.pdf`; // Default
      if (disposition && disposition.indexOf("attachment") !== -1) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, "");
        }
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report exported successfully!");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to export sprint."
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadMvp = async (projectId: string) => {
    setIsDownloadingMvp(true);
    try {
      const response = await fetch("/api/scaffold/mvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        let errorMessage = `Failed to generate MVP (Status: ${response.status})`;
        try {
          if (
            response.headers.get("Content-Type")?.includes("application/json")
          ) {
            const errorData = (await response.json()) as ApiErrorResponse;
            if (errorData.message) errorMessage = errorData.message;
          } else {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
          }
        } catch (parseError) {
          console.error("Failed to parse error response:", parseError);
        }
        throw new Error(errorMessage);
      }

      // Process the ZIP blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mvp-codebase.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("MVP codebase downloaded successfully!");
      trackEvent("download_mvp_codebase", {
        conversationId: conversationId,
      });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download MVP."
      );
    } finally {
      setIsDownloadingMvp(false);
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
            <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-0">
              <button
                onClick={() => void handleDownloadMvp(landingPageId)}
                disabled={isDownloadingMvp}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-md disabled:opacity-50 w-full sm:w-auto"
              >
                {isDownloadingMvp
                  ? "Building MVP..."
                  : "🚀 Build & Download MVP"}
              </button>
              <button
                onClick={() => void handleExport()}
                disabled={isExporting}
                className="px-4 py-2 bg-primary/10 text-primary text-sm font-semibold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50 w-full sm:w-auto"
              >
                {isExporting ? "Exporting..." : "Export Report"}
              </button>
            </div>
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
