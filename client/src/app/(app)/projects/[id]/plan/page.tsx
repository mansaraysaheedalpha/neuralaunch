"use client";

import { use, useState } from "react";
import useSWR, { mutate } from "swr";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  MessageSquare,
  Play,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface PlanReviewPageProps {
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

export default function PlanReviewPage({ params }: PlanReviewPageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();
  
  // State
  const [feedback, setFeedback] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Fetch project and plan data
  const { data: project, error: projectError } = useSWR(
    `/api/projects/${projectId}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data: planData, error: planError } = useSWR(
    `/api/projects/${projectId}/agent/plan`,
    fetcher,
    { refreshInterval: 5000 }
  );

  // Handle feedback analysis
  const handleAnalyzeFeedback = async () => {
    if (!feedback.trim()) {
      toast.error("Please enter your feedback");
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/agent/plan/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: project?.conversationId || projectId,
          freeformFeedback: feedback,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to analyze feedback");
      }

      const result = await response.json();
      setAnalysisResult(result.analysis);
      toast.success("Feedback analyzed successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to analyze feedback");
      console.error("Feedback analysis error:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle applying feedback
  const handleApplyFeedback = async () => {
    if (!analysisResult) {
      toast.error("Please analyze feedback first");
      return;
    }

    if (!analysisResult.feasible) {
      toast.error("This feedback has blockers that must be resolved first");
      return;
    }

    setIsApplying(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/agent/plan/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: project?.conversationId || projectId,
          feedback,
          analysisResult,
          action: "proceed",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to apply feedback");
      }

      const result = await response.json();
      toast.success("Plan updated successfully!");
      
      // Clear feedback and analysis
      setFeedback("");
      setAnalysisResult(null);
      
      // Refresh plan data
      mutate(`/api/projects/${projectId}/agent/plan`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply feedback");
      console.error("Apply feedback error:", error);
    } finally {
      setIsApplying(false);
    }
  };

  // Handle reverting to original plan
  const handleRevertPlan = async () => {
    setIsApplying(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/agent/plan/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: project?.conversationId || projectId,
          feedback: null,
          analysisResult: null,
          action: "revert",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to revert plan");
      }

      toast.success("Reverted to original plan");
      setFeedback("");
      setAnalysisResult(null);
      mutate(`/api/projects/${projectId}/agent/plan`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revert plan");
      console.error("Revert plan error:", error);
    } finally {
      setIsApplying(false);
    }
  };

  // Handle starting execution
  const handleStartExecution = async () => {
    setIsStarting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: project?.conversationId || projectId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start execution");
      }

      toast.success("Execution started!");
      router.push(`/projects/${projectId}/execution`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start execution");
      console.error("Start execution error:", error);
    } finally {
      setIsStarting(false);
    }
  };

  // Error states
  if (projectError || planError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Error Loading Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {projectError?.message || planError?.message || "Failed to load plan data"}
            </p>
            <Button onClick={() => router.push(`/projects/${projectId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Project
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (!project || !planData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading plan...</p>
        </div>
      </div>
    );
  }

  // No plan available
  if (!planData.hasPlan || !planData.plan) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              No Plan Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              No execution plan has been generated yet. Please run the planning agent first.
            </p>
            <Button onClick={() => router.push(`/projects/${projectId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Project
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = planData.plan;
  const revisionCount = planData.plan?.metadata?.revisionCount || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/projects/${projectId}`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Project
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                  <FileText className="w-8 h-8 text-primary" />
                  Execution Plan
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Review and modify your project execution plan
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {revisionCount > 0 && (
                <Badge variant="secondary">
                  {revisionCount} revision{revisionCount > 1 ? "s" : ""}
                </Badge>
              )}
              <Button
                onClick={handleStartExecution}
                disabled={isStarting}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                {isStarting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Start Execution
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column: Plan Details */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="architecture">Architecture</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Plan Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Tasks</p>
                        <p className="text-2xl font-bold">{plan.tasks?.length || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Phases</p>
                        <p className="text-2xl font-bold">{plan.phases?.length || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Estimated Hours</p>
                        <p className="text-2xl font-bold">{plan.totalEstimatedHours || 0}h</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Critical Path</p>
                        <p className="text-2xl font-bold">{plan.criticalPath?.length || 0} tasks</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Phases */}
                <Card>
                  <CardHeader>
                    <CardTitle>Execution Phases</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {plan.phases?.map((phase: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div>
                            <p className="font-semibold">{phase.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {phase.taskIds?.length || 0} tasks • {phase.estimatedDuration}
                            </p>
                          </div>
                          <Badge variant="outline">{index + 1}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tasks" className="space-y-4">
                {plan.tasks?.map((task: any) => (
                  <Card key={task.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{task.title}</CardTitle>
                          <CardDescription>{task.description}</CardDescription>
                        </div>
                        <Badge
                          variant={task.complexity === "simple" ? "default" : "secondary"}
                        >
                          {task.complexity}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Category</p>
                          <Badge variant="outline">{task.category}</Badge>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Priority</p>
                          <Badge variant="outline">{task.priority}</Badge>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Est. Hours</p>
                          <p className="font-semibold">{task.estimatedHours}h</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Est. Lines</p>
                          <p className="font-semibold">{task.estimatedLines}</p>
                        </div>
                      </div>
                      {task.dependencies?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-sm text-muted-foreground mb-1">Dependencies</p>
                          <div className="flex flex-wrap gap-1">
                            {task.dependencies.map((dep: string) => (
                              <Badge key={dep} variant="secondary" className="text-xs">
                                {dep}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {task.acceptanceCriteria?.length > 0 && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Acceptance Criteria</p>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            {task.acceptanceCriteria.map((criteria: string, idx: number) => (
                              <li key={idx}>{criteria}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="architecture" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Technical Architecture</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {plan.architecture?.frontendArchitecture && (
                      <div>
                        <h4 className="font-semibold mb-2">Frontend</h4>
                        <div className="space-y-2 text-sm">
                          <p><span className="text-muted-foreground">Framework:</span> {plan.architecture.frontendArchitecture.framework}</p>
                          <p><span className="text-muted-foreground">State:</span> {plan.architecture.frontendArchitecture.stateManagement}</p>
                          <p><span className="text-muted-foreground">Routing:</span> {plan.architecture.frontendArchitecture.routing}</p>
                          <p><span className="text-muted-foreground">Styling:</span> {plan.architecture.frontendArchitecture.styling}</p>
                        </div>
                      </div>
                    )}
                    {plan.architecture?.backendArchitecture && (
                      <div>
                        <h4 className="font-semibold mb-2">Backend</h4>
                        <div className="space-y-2 text-sm">
                          <p><span className="text-muted-foreground">Framework:</span> {plan.architecture.backendArchitecture.framework}</p>
                          <p><span className="text-muted-foreground">API Pattern:</span> {plan.architecture.backendArchitecture.apiPattern}</p>
                          <p><span className="text-muted-foreground">Auth:</span> {plan.architecture.backendArchitecture.authentication}</p>
                        </div>
                      </div>
                    )}
                    {plan.architecture?.databaseArchitecture && (
                      <div>
                        <h4 className="font-semibold mb-2">Database</h4>
                        <div className="space-y-2 text-sm">
                          <p><span className="text-muted-foreground">Type:</span> {plan.architecture.databaseArchitecture.type}</p>
                          <p><span className="text-muted-foreground">ORM:</span> {plan.architecture.databaseArchitecture.orm}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column: Feedback & Actions */}
          <div className="space-y-6">
            {/* Feedback Input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Provide Feedback
                </CardTitle>
                <CardDescription>
                  Suggest changes to the plan. The validation agent will check feasibility.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="E.g., 'Add authentication using Auth0', 'Split the dashboard task into smaller pieces', 'Use MongoDB instead of PostgreSQL'"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <Button
                  onClick={handleAnalyzeFeedback}
                  disabled={isAnalyzing || !feedback.trim()}
                  className="w-full"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Analyze Feedback
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Analysis Result */}
            {analysisResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className={analysisResult.feasible ? "w-5 h-5 text-green-500" : "w-5 h-5 text-red-500"} />
                    Analysis Result
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analysisResult.feasible ? (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        Your changes are feasible and can be applied to the plan.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Your changes have blockers that must be resolved.
                      </AlertDescription>
                    </Alert>
                  )}

                  {analysisResult.warnings?.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">Warnings</p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        {analysisResult.warnings.map((warning: string, idx: number) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysisResult.blockers?.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">Blockers</p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-destructive">
                        {analysisResult.blockers.map((blocker: string, idx: number) => (
                          <li key={idx}>{blocker}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysisResult.feasible && (
                    <Button
                      onClick={handleApplyFeedback}
                      disabled={isApplying}
                      className="w-full"
                    >
                      {isApplying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Apply Changes
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Plan Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {revisionCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleRevertPlan}
                    disabled={isApplying}
                    className="w-full"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Revert to Original Plan
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
