// src/components/landing-page/SprintDashboard.tsx - ENHANCED VERSION
"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Task, TaskOutput } from "@prisma/client";
import TaskCard from "./TaskCard";
import AIAssistantModal from "./AIAssistantModal";
import SprintAnalytics from "./SprintAnalytics";
import SprintAchievements from "./SprintAchievements";
import { useRouter } from "next/navigation";
import { Bot, ArrowRight, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SprintData {
  tasks: Array<Task & { outputs: TaskOutput[] }>;
}

interface ApiErrorResponse {
  message?: string;
}

const fetcher = (url: string): Promise<SprintData> =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const errorData: unknown = await res.json().catch(() => ({}));
      const typedError = errorData as ApiErrorResponse;
      throw new Error(typedError.message || `API Error: ${res.status}`);
    }
    const data: unknown = await res.json();
    return data as SprintData;
  });

export default function SprintDashboard({
  conversationId,
  landingPageId,
  blueprint, // NEW: Pass blueprint text
}: {
  conversationId: string;
  landingPageId: string;
  blueprint?: string; // Optional blueprint text
}) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeAssistantTask, setActiveAssistantTask] = useState<Task | null>(
    null
  );

  // NEW: Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);

  const { data, error, mutate } = useSWR<SprintData, Error>(
    `/api/sprint/${conversationId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

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
      await mutate();
    } catch (err: unknown) {
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
        let errorMessage = `Failed to export sprint (Status: ${response.status})`;
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

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = response.headers.get("Content-Disposition");
      let filename = `neuralaunch-report-${conversationId}.pdf`;
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

  // NEW: Show confirmation modal
  const handleOpenConfirmModal = () => {
    setShowConfirmModal(true);
    trackEvent("clicked_build_with_agents", {
      conversationId,
      projectId: landingPageId,
    });
  };

  // NEW: Confirmed build action
  const handleConfirmBuild = async () => {
    if (!landingPageId) {
      toast.error("Project ID is missing, cannot start build.");
      logger.error("[SprintDashboard] Missing landingPageId for agent build.");
      return;
    }

    setIsBuilding(true);

    try {
      // Calculate sprint analytics for priority hints
      const completedTasks =
        data?.tasks.filter((t) => t.status === "completed") || [];
      const sprintAnalytics = {
        completedCount: completedTasks.length,
        totalCount: data?.tasks.length || 0,
        completionRate: data?.tasks.length
          ? (completedTasks.length / data.tasks.length) * 100
          : 0,
      };

      // Call orchestrator API with blueprint source
      const response = await fetch("/api/orchestrator/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "blueprint",
          conversationId: conversationId,
          blueprint: blueprint || "", // Use provided blueprint
          sprintData: {
            completedTasks: completedTasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
            })),
            analytics: sprintAnalytics,
            validationResults: {
              validated: completedTasks.length > 0,
              features: completedTasks.map((t) => t.title),
            },
          },
          async: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to start build");
      }

      const result = await response.json();

      trackEvent("started_agent_build", {
        conversationId,
        projectId: result.projectId,
        validatedTasks: completedTasks.length,
      });

      toast.success("AI Agents are building your MVP! Redirecting...");

      // Redirect to execution dashboard
      setTimeout(() => {
        router.push(`/agent-build/${result.projectId}/execution`);
      }, 1500);
    } catch (error) {
      console.error("Build start error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start build"
      );
      setIsBuilding(false);
      setShowConfirmModal(false);
    }
  };

  if (error) {
    return (
      <div className="text-red-500 p-8">
        Failed to load sprint data. Please refresh.
      </div>
    );
  }

  if (!data) {
    return <div className="text-center p-8">Loading Sprint Dashboard...</div>;
  }

  const tasks = data?.tasks ?? [];
  const hasTasks = tasks.length > 0;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalCount = tasks.length;
  const hasValidation = completedCount > 0;

  return (
    <div>
      <AIAssistantModal
        task={activeAssistantTask}
        onClose={() => setActiveAssistantTask(null)}
      />

      {/* NEW: Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="w-6 h-6 text-primary" />
              Ready to Build Your MVP?
            </DialogTitle>
            <DialogDescription className="text-base pt-4">
              {hasValidation ? (
                <div className="space-y-4">
                  <p className="text-foreground font-medium">
                    Your sprint validation shows:
                  </p>
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-foreground">
                        {completedCount} of {totalCount} tasks completed
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-foreground">
                        Positive market signals detected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-foreground">
                        Clear value proposition validated
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <p className="text-foreground font-medium mb-2">
                      Our AI agents will now:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Analyze your blueprint and sprint results</li>
                      <li>Create a technical architecture</li>
                      <li>Build your full-stack application</li>
                      <li>Set up testing and deployment</li>
                    </ol>
                  </div>

                  <div className="pt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium">Estimated time:</span>
                    <span>20-30 minutes</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-foreground">
                    You haven&apos;t completed any validation tasks yet. We
                    recommend completing at least a few tasks to validate your
                    idea before building.
                  </p>
                  <p className="text-muted-foreground">
                    However, you can still proceed if you&apos;re confident in
                    your vision.
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={isBuilding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBuild}
              disabled={isBuilding}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {isBuilding ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="mr-2"
                  >
                    <Bot className="w-4 h-4" />
                  </motion.div>
                  Starting Agents...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start Building
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Dashboard Header */}
      <div className="mb-8 p-6 bg-card border border-border rounded-2xl">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">
              🚀 72-Hour Validation Sprint
            </h2>
            <p className="text-muted-foreground mt-2">
              Turn your blueprint into action. Complete tasks to validate your
              idea.
            </p>
          </div>

          {/* Action Buttons - Shown once sprint tasks exist */}
          {hasTasks && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto self-start sm:self-center">
              {/* ENHANCED: Build with AI Agents Button */}
              <motion.button
                onClick={handleOpenConfirmModal}
                disabled={isBuilding}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-md disabled:opacity-50 ring-2 ring-purple-400/30"
              >
                <Bot className="w-5 h-5" />
                Build with AI Agents
                <ArrowRight className="w-4 h-4" />
              </motion.button>

              {/* Export Report Button */}
              <button
                onClick={() => void handleExport()}
                disabled={isExporting}
                className="w-full sm:w-auto px-4 py-2 bg-primary/10 text-primary text-sm font-semibold rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {isExporting ? "Exporting..." : "Export Report"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sprint Start or Task List */}
      {!hasTasks ? (
        <div className="text-center py-12">
          <motion.button
            onClick={() => void handleStartSprint()}
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
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onAssistantLaunch={setActiveAssistantTask}
              />
            ))}
          </div>
          <SprintAchievements conversationId={conversationId} />
        </div>
      )}
    </div>
  );
}
