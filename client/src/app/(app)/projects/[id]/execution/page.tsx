// app/(app)/projects/[id]/execution/page.tsx - PROFESSIONAL UI REFACTOR
"use client";

import { use } from "react";
import useSWR from "swr";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import WaveTimeline from "@/components/execution/WaveTimeline";
import AgentGrid from "@/components/execution/AgentGrid";
import AgentPipeline from "@/components/execution/AgentPipeline";
import { ExecutionTabs } from "@/components/execution/ExecutionTabs";
import {
  isPlanningPhase,
  ORCHESTRATOR_PHASES,
} from "@/lib/orchestrator/phases";

// ═══════════════════════════════════════════════════════════════════
// STATUS BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    completed: {
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      text: "text-emerald-700 dark:text-emerald-300",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      bg: "bg-red-100 dark:bg-red-900/30",
      text: "text-red-700 dark:text-red-300",
      icon: <AlertCircle className="h-3 w-3" />,
    },
    executing: {
      bg: "bg-blue-100 dark:bg-blue-900/30",
      text: "text-blue-700 dark:text-blue-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    planning: {
      bg: "bg-violet-100 dark:bg-violet-900/30",
      text: "text-violet-700 dark:text-violet-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    initializing: {
      bg: "bg-amber-100 dark:bg-amber-900/30",
      text: "text-amber-700 dark:text-amber-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
  };

  const { bg, text, icon } = config[status] || config.initializing;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
      {icon}
      <span className="capitalize">{status}</span>
    </span>
  );
}

interface ExecutionPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface Task {
  id: string;
  status: string;
  name?: string;
  createdAt?: string;
}

interface Wave {
  id: string;
  waveNumber: number;
  status: string;
}

interface Project {
  id: string;
  name?: string;
  status?: string;
  createdAt?: string | number | Date;
  conversationId?: string;
}

interface TasksData {
  tasks: Task[];
  waves: Wave[];
}

interface OrchestratorStatus {
  currentWave?: number;
  progress?: number;
  activeAgents?: string[];
  currentPhase?: string;
  currentAgent?: string;
  completedPhases?: string[];
}

const fetcher = async <T = unknown>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const errorData = await res.json() as { error?: string };
      throw new Error(errorData.error ?? `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

export default function ExecutionDashboardPage({ params }: ExecutionPageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();

  // Fetch project data with polling
  const { data: project, error: projectError } = useSWR<Project, Error>(
    `/api/projects/${projectId}`,
    fetcher<Project>,
    {
      refreshInterval: 3000, // Poll every 3 seconds
      revalidateOnFocus: true,
    }
  );

  // Fetch tasks data (fetch ALL tasks, not just first 20)
  const { data: tasksData, error: tasksError } = useSWR<TasksData, Error>(
    `/api/projects/${projectId}/tasks?limit=1000`,  // ✅ Fetch all tasks
    fetcher<TasksData>,
    { refreshInterval: 2000 }
  );

  // Fetch orchestrator status
  const { data: status } = useSWR<OrchestratorStatus>(
    `/api/orchestrator/status/${projectId}`,
    fetcher<OrchestratorStatus>,
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
    (t) => t.status === "COMPLETE" || t.status === "completed"
  ).length;
  const totalTasks = tasks.length;

  // ✅ Get current phase and agent info from status API
  const currentPhase = status?.currentPhase || "initializing";
  const isInPlanningPhase = isPlanningPhase(currentPhase);
  const isPlanReview = currentPhase === ORCHESTRATOR_PHASES.PLAN_REVIEW;

  // ✅ Handle currentAgent - it might be a string or an object
  const currentAgentRaw = status?.currentAgent as string | { name: string } | undefined;
  const currentAgent = typeof currentAgentRaw === 'string'
    ? currentAgentRaw
    : currentAgentRaw && typeof currentAgentRaw === 'object' && 'name' in currentAgentRaw
      ? String(currentAgentRaw.name)
      : undefined;

      const isExecuting =
        project.status === "executing" || project.status === "completed";
        const showPipeline =
          (isInPlanningPhase || isPlanReview) && !isExecuting;

  // Calculate progress percentage for visual indicator
  const progressPercent = Math.round(progress);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER - Minimal, clean navigation
      ═══════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6">
          <div className="flex h-16 items-center justify-between">
            {/* Left: Back + Project Name */}
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold tracking-tight">
                  {project.name || "Project"}
                </h1>
                <StatusBadge status={project.status || "initializing"} />
              </div>
            </div>

            {/* Right: Navigation */}
            <nav className="flex items-center gap-1">
              <Link href={`/projects/${projectId}/plan`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Plan
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/quality`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <FileCheck className="h-4 w-4" />
                  Quality
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/deployment`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Rocket className="h-4 w-4" />
                  Deploy
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/monitoring`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Activity className="h-4 w-4" />
                  Monitor
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          PROGRESS BAR - Sleek, minimal
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="border-b bg-background/50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-6">
            {/* Progress Ring */}
            <div className="relative h-14 w-14 flex-shrink-0">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-muted/30"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={`${progressPercent}, 100`}
                  className="text-primary transition-all duration-500"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
                {progressPercent}%
              </span>
            </div>

            {/* Stats */}
            <div className="flex-1 grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Current Phase</p>
                <p className="text-sm font-medium mt-0.5 truncate">
                  {currentAgent || currentPhase}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Tasks</p>
                <p className="text-sm font-medium mt-0.5">
                  {completedTasks} <span className="text-muted-foreground">/ {totalTasks}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Agents</p>
                <p className="text-sm font-medium mt-0.5">{activeAgents.length}</p>
              </div>
            </div>

            {/* Time */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {project.createdAt
                  ? new Date(project.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PLAN REVIEW BANNER - Clean call-to-action
      ═══════════════════════════════════════════════════════════════════ */}
      {isPlanReview && (
        <div className="border-b bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-emerald-900 dark:text-emerald-100">
                    Planning Complete
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Review your execution plan before starting
                  </p>
                </div>
              </div>
              <Link href={`/projects/${projectId}/plan`}>
                <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                  Review Plan
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT - Clean two-column layout
      ═══════════════════════════════════════════════════════════════════ */}
      <main className="container mx-auto px-6 py-6">
        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          {/* ───────────────────────────────────────────────────────────────
              LEFT SIDEBAR - Compact, information-dense
          ─────────────────────────────────────────────────────────────── */}
          <aside className="space-y-4">
            {/* Wave Timeline Card */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/30">
                <h3 className="text-sm font-medium">Wave Progress</h3>
              </div>
              <CardContent className="p-4">
                <WaveTimeline
                  waves={waves as unknown as import("@/types/component-props").Wave[]}
                  currentWave={currentWave}
                />
              </CardContent>
            </Card>

            {/* Quick Stats Card */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/30">
                <h3 className="text-sm font-medium">Quick Stats</h3>
              </div>
              <CardContent className="p-0">
                <div className="divide-y">
                  <StatRow label="Tasks" value={`${completedTasks} / ${totalTasks}`} />
                  <StatRow label="Waves" value={`${currentWave} / ${waves.length}`} />
                  <StatRow label="Active Agents" value={String(activeAgents.length)} />
                  {totalTasks > 0 && (
                    <StatRow
                      label="Progress"
                      value={`${Math.round((completedTasks / totalTasks) * 100)}%`}
                      highlight
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* ───────────────────────────────────────────────────────────────
              MAIN AREA - Primary content
          ─────────────────────────────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Agent Pipeline - Planning Phase */}
            {showPipeline && (
              <AgentPipeline
                currentPhase={currentPhase}
                completedPhases={status?.completedPhases || []}
                projectId={projectId}
                currentAgent={
                  currentAgent
                    ? { name: currentAgent, description: "", icon: "" }
                    : undefined
                }
              />
            )}

            {/* Agent Grid - Execution Phase */}
            {(isExecuting || (!isInPlanningPhase && !isPlanReview)) && totalTasks > 0 && (
              <Card className="overflow-hidden">
                <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
                  <h3 className="text-sm font-medium">AI Agents</h3>
                  <span className="text-xs text-muted-foreground">
                    {activeAgents.length} active
                  </span>
                </div>
                <CardContent className="p-5">
                  <AgentGrid
                    tasks={tasks as unknown as import("@/types/component-props").Task[]}
                    activeAgents={activeAgents}
                    _currentWave={currentWave}
                  />
                </CardContent>
              </Card>
            )}

            {/* Execution Tabs */}
            <ExecutionTabs
              projectId={projectId}
              conversationId={project.conversationId || ""}
              tasks={tasks as unknown as import("@/types/component-props").Task[]}
              currentWave={currentWave}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STAT ROW COMPONENT
// ═══════════════════════════════════════════════════════════════════
function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}
