// app/(app)/projects/[id]/execution/page.tsx - UPDATED FOR REAL-TIME THOUGHTS
"use client";

import { use } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Rocket,
  Activity,
  FileCheck,
  FileText,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import WaveTimeline from "@/components/execution/WaveTimeline";
import AgentGrid from "@/components/execution/AgentGrid";
import AgentPipeline from "@/components/execution/AgentPipeline";
import { ExecutionTabs } from "@/components/execution/ExecutionTabs";
import {
  isPlanningPhase,
  ORCHESTRATOR_PHASES,
} from "@/lib/orchestrator/phases";

interface ExecutionPageProps {
  params: Promise<{
    id: string;
  }>;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const errorData = await res.json();
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

export default function ExecutionDashboardPage({ params }: ExecutionPageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();

  // Fetch project data with polling
  const { data: project, error: projectError } = useSWR(
    `/api/projects/${projectId}`,
    fetcher,
    {
      refreshInterval: 3000, // Poll every 3 seconds
      revalidateOnFocus: true,
    }
  );

  // Fetch tasks data
  const { data: tasksData, error: tasksError } = useSWR(
    `/api/projects/${projectId}/tasks`,
    fetcher,
    { refreshInterval: 2000 }
  );

  // Fetch orchestrator status
  const { data: status } = useSWR(
    `/api/orchestrator/status/${projectId}`,
    fetcher,
    { refreshInterval: 2000 }
  );

  if (projectError || tasksError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Error Loading Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {projectError?.message ||
                tasksError?.message ||
                "Failed to load project data"}
            </p>
            <Button onClick={() => router.push("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project || !tasksData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading project execution...</p>
        </div>
      </div>
    );
  }

  const tasks = tasksData?.tasks || [];
  const waves = tasksData?.waves || [];
  const currentWave = status?.currentWave || 0;
  const progress = status?.progress || 0;
  const activeAgents = status?.activeAgents || [];

  const completedTasks = tasks.filter(
    (t: any) => t.status === "COMPLETE" || t.status === "completed"
  ).length;
  const totalTasks = tasks.length;

  // ✅ Get current phase and agent info from status API
  const currentPhase = status?.currentPhase || "initializing";
  const isInPlanningPhase = isPlanningPhase(currentPhase);
  const isPlanReview = currentPhase === ORCHESTRATOR_PHASES.PLAN_REVIEW;
  const currentAgent = status?.currentAgent;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {project.name || "Project Execution"}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      project.status === "completed"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                        : project.status === "failed"
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                    }`}
                  >
                    {project.status === "completed" && (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    {(project.status === "executing" ||
                      project.status === "initializing" ||
                      project.status === "planning") && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    {project.status}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Started {new Date(project.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="flex items-center gap-2">
              <Link href={`/projects/${projectId}/quality`}>
                <Button variant="outline" size="sm">
                  <FileCheck className="w-4 h-4 mr-2" />
                  Quality
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/deployment`}>
                <Button variant="outline" size="sm">
                  <Rocket className="w-4 h-4 mr-2" />
                  Deployment
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/monitoring`}>
                <Button variant="outline" size="sm">
                  <Activity className="w-4 h-4 mr-2" />
                  Monitoring
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Overall Progress</span>
              <span className="text-muted-foreground">
                {Math.round(progress)}%
              </span>
            </div>
            <Progress value={progress} className="h-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {currentAgent?.name || currentPhase} • {activeAgents.length}{" "}
                agents active
              </span>
              <span>
                {completedTasks} / {totalTasks} tasks completed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Plan Review Banner */}
      {isPlanReview && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-b border-green-200 dark:border-green-800">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-green-900 dark:text-green-100">
                    Planning Complete - Ready for Review
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Your execution plan is ready. Review the plan, provide
                    feedback, or start execution.
                  </p>
                </div>
              </div>
              <Link href={`/projects/${projectId}/plan`}>
                <Button
                  size="lg"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Review Plan
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[350px_1fr] gap-6">
          {/* Left Sidebar */}
          <div className="space-y-6">
            {/* Wave Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Wave Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <WaveTimeline waves={waves} currentWave={currentWave} />
              </CardContent>
            </Card>

            {/* Project Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tasks</span>
                  <span className="text-sm font-medium">
                    {completedTasks} / {totalTasks}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Waves</span>
                  <span className="text-sm font-medium">
                    {currentWave} / {waves.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Active Agents
                  </span>
                  <span className="text-sm font-medium">
                    {activeAgents.length}
                  </span>
                </div>
                {totalTasks > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Completion
                    </span>
                    <span className="text-sm font-medium">
                      {Math.round((completedTasks / totalTasks) * 100)}%
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="space-y-6">
            {/* ✅ Show Agent Pipeline with Real-Time Thoughts during planning */}
            {isInPlanningPhase || isPlanReview ? (
              <AgentPipeline
                currentPhase={currentPhase}
                completedPhases={status?.completedPhases || []}
                projectId={projectId}
                currentAgent={currentAgent}
              />
            ) : null}

            {/* Show Agent Grid during execution phase */}
            {!isInPlanningPhase && !isPlanReview && totalTasks > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Agents</CardTitle>
                </CardHeader>
                <CardContent>
                  <AgentGrid
                    tasks={tasks}
                    activeAgents={activeAgents}
                    currentWave={currentWave}
                  />
                </CardContent>
              </Card>
            )}

            {/* ✅ NEW: Execution Tabs (Activity, Code, Commands, Wave Approval) */}
            <ExecutionTabs
              projectId={projectId}
              conversationId={project.conversationId || ""}
              tasks={tasks}
              currentWave={currentWave}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
