// src/app/(app)/projects/[id]/page.tsx
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
  Code,
  TrendingUp,
  FolderOpen,
  BookOpen,
  PlayCircle,
  GitBranch,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

interface ProjectOverviewPageProps {
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

export default function ProjectOverviewPage({ params }: ProjectOverviewPageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();

  // Fetch project data
  const { data: project, error: projectError } = useSWR(
    `/api/projects/${projectId}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  // Fetch tasks data
  const { data: tasksData } = useSWR(
    `/api/projects/${projectId}/tasks`,
    fetcher,
    { refreshInterval: 5000 }
  );

  // Fetch orchestrator status
  const { data: status } = useSWR(
    `/api/orchestrator/status/${projectId}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  if (projectError) {
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
              {projectError?.message || "Failed to load project data"}
            </p>
            <Button onClick={() => router.push("/projects")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  const tasks = tasksData?.tasks || [];
  const waves = tasksData?.waves || [];
  const completedTasks = tasks.filter((t: any) => t.status === "COMPLETE").length;
  const totalTasks = tasks.length;
  const progress = status?.progress || project.progress || 0;

  const navigationCards = [
    {
      title: "Execution",
      description: "Monitor AI agent progress and wave execution",
      icon: PlayCircle,
      href: `/projects/${projectId}/execution`,
      color: "from-blue-500 to-cyan-500",
      stats: `${completedTasks}/${totalTasks} tasks`,
    },
    {
      title: "Quality",
      description: "Review code quality, tests, and reviews",
      icon: FileCheck,
      href: `/projects/${projectId}/quality`,
      color: "from-green-500 to-emerald-500",
      stats: "Quality checks",
    },
    {
      title: "Deployment",
      description: "Manage preview and production deployments",
      icon: Rocket,
      href: `/projects/${projectId}/deployment`,
      color: "from-purple-500 to-pink-500",
      stats: "Deploy status",
    },
    {
      title: "Monitoring",
      description: "Track application health and performance",
      icon: Activity,
      href: `/projects/${projectId}/monitoring`,
      color: "from-orange-500 to-red-500",
      stats: "Live metrics",
    },
    {
      title: "Documentation",
      description: "View auto-generated project documentation",
      icon: BookOpen,
      href: `/projects/${projectId}/documentation`,
      color: "from-indigo-500 to-blue-500",
      stats: "Docs & guides",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/projects">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  All Projects
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-8 h-8 text-primary" />
                  <div>
                    <h1 className="text-3xl font-bold text-foreground">
                      {project.name || "Untitled Project"}
                    </h1>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          project.status === "completed"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                            : project.status === "failed"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                        }`}
                      >
                        {project.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                        {project.status === "executing" && <Loader2 className="w-3 h-3 animate-spin" />}
                        {project.status || "active"}
                      </span>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Created {formatDistanceToNow(new Date(project.createdAt))} ago
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Banner */}
      {totalTasks > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-b bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5"
        >
          <div className="container mx-auto px-4 py-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Project Progress
                </h3>
                <span className="text-2xl font-bold text-primary">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{completedTasks}</span> /{" "}
                    {totalTasks} tasks
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-blue-500" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{waves.length}</span> waves
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span className="text-muted-foreground">
                    {status?.activeAgents?.length || 0} active agents
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-purple-500" />
                  <span className="text-muted-foreground">{status?.currentPhase || "Ready"}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {project.description && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Project Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{project.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Navigation Cards */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-4">Quick Navigation</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {navigationCards.map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={card.href}>
                  <Card className="group cursor-pointer hover:shadow-lg transition-all hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="flex items-center gap-2 mb-2">
                            <div
                              className={`p-2 rounded-lg bg-gradient-to-r ${card.color} text-white`}
                            >
                              <card.icon className="w-5 h-5" />
                            </div>
                            {card.title}
                          </CardTitle>
                          <CardDescription className="text-sm">
                            {card.description}
                          </CardDescription>
                        </div>
                        <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors rotate-180" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{card.stats}</span>
                        <span className="text-xs font-medium text-primary group-hover:underline">
                          View Details →
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        {status?.currentPhase && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Current Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Phase: <span className="font-medium text-foreground">{status.currentPhase}</span>
                </p>
                {status.activeAgents && status.activeAgents.length > 0 && (
                  <p className="text-muted-foreground">
                    Active Agents:{" "}
                    <span className="font-medium text-foreground">
                      {status.activeAgents.join(", ")}
                    </span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
