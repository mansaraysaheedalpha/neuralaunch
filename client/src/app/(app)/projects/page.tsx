// src/app/(app)/projects/page.tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  Rocket,
  Plus,
  Search,
  Filter,
  Grid3x3,
  List,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

interface Project {
  id: string;
  name: string;
  description?: string;
  status: "initializing" | "planning" | "executing" | "quality_check" | "deploying" | "completed" | "failed";
  progress?: number;
  createdAt: string;
  updatedAt: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const statusConfig = {
  initializing: {
    label: "Initializing",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    icon: Loader2,
  },
  planning: {
    label: "Planning",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    icon: Clock,
  },
  executing: {
    label: "Building",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    icon: Loader2,
  },
  quality_check: {
    label: "Testing",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: AlertCircle,
  },
  deploying: {
    label: "Deploying",
    color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    icon: Rocket,
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: CheckCircle,
  },
  failed: {
    label: "Failed",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: AlertCircle,
  },
};

export default function ProjectsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Fetch projects
  const { data, error, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    "/api/projects",
    fetcher,
    { refreshInterval: 10000 }
  );

  const projects = data?.projects || [];

  // Filter projects
  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === "executing").length,
    completed: projects.filter((p) => p.status === "completed").length,
    failed: projects.filter((p) => p.status === "failed").length,
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete project");
      }

      toast.success("Project deleted successfully");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete project"
      );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                My Projects
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your AI-generated applications
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => router.push("/agentic")}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                New Project
              </Button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-foreground">
                  {stats.total}
                </div>
                <p className="text-xs text-muted-foreground">Total Projects</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-purple-600">
                  {stats.active}
                </div>
                <p className="text-xs text-muted-foreground">Active Builds</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">
                  {stats.completed}
                </div>
                <p className="text-xs text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-600">
                  {stats.failed}
                </div>
                <p className="text-xs text-muted-foreground">Failed</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[200px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="executing">Building</SelectItem>
              <SelectItem value="quality_check">Testing</SelectItem>
              <SelectItem value="deploying">Deploying</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("grid")}
            >
              <Grid3x3 className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
              <p className="text-muted-foreground">Loading projects...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertCircle className="w-5 h-5" />
                <p className="font-medium">Failed to load projects</p>
              </div>
              <p className="text-muted-foreground text-sm">
                {error.message || "An error occurred while fetching projects"}
              </p>
              <Button onClick={() => mutate()} className="mt-4">
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredProjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <Card className="max-w-md mx-auto">
              <CardContent className="pt-6">
                <Rocket className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {searchQuery || statusFilter !== "all"
                    ? "No projects found"
                    : "No projects yet"}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {searchQuery || statusFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Start building your first AI-powered application"}
                </p>
                <Button
                  onClick={() => router.push("/agentic")}
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Your First Project
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Projects Grid/List */}
        {!isLoading && !error && filteredProjects.length > 0 && (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                : "space-y-4"
            }
          >
            {filteredProjects.map((project, index) => {
              const StatusIcon = statusConfig[project.status].icon;

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="hover:shadow-lg transition-shadow group">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">
                            <Link
                              href={`/projects/${project.id}/execution`}
                              className="hover:text-primary transition-colors"
                            >
                              {project.name}
                            </Link>
                          </CardTitle>
                          {project.description && (
                            <CardDescription className="mt-1">
                              {project.description.slice(0, 100)}
                              {project.description.length > 100 && "..."}
                            </CardDescription>
                          )}
                        </div>
                        <Badge className={statusConfig[project.status].color}>
                          <StatusIcon
                            className={`w-3 h-3 mr-1 ${
                              project.status === "executing" ? "animate-spin" : ""
                            }`}
                          />
                          {statusConfig[project.status].label}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Progress Bar */}
                      {project.progress !== undefined && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Progress
                            </span>
                            <span className="font-medium">
                              {project.progress}%
                            </span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Timestamps */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          Created{" "}
                          {formatDistanceToNow(new Date(project.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          asChild
                          size="sm"
                          variant="default"
                          className="flex-1"
                        >
                          <Link href={`/projects/${project.id}/execution`}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View Details
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleDeleteProject(project.id, project.name)
                          }
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
