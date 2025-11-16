// src/app/(app)/projects/[id]/quality/page.tsx
"use client";

import { use } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Loader2,
  ThumbsUp,
  Rocket,
  Activity,
  Zap,
  FileText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QualityScoreCard from "@/components/quality/QualityScoreCard";
import IssueList from "@/components/quality/IssueList";
import TestResultsViewer from "@/components/quality/TestResultsViewer";
import toast from "react-hot-toast";

interface QualityPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface QualityData {
  score?: number;
  issues?: unknown[];
  testResults?: unknown;
  [key: string]: unknown;
}

interface ReviewsData {
  reviews?: unknown[];
  [key: string]: unknown;
}

const fetcher = async <T = unknown>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    // Check if response is JSON
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const errorData = await res.json() as { error?: string };
      throw new Error(errorData.error ?? `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};



export default function QualityDashboardPage({ params }: QualityPageProps) {
  const { id: projectId } = use(params) as { id: string };
  const router = useRouter();

  // Fetch project quality data
  const swrQualityResult = useSWR<QualityData>(
    `/api/projects/${projectId}/quality`,
    fetcher<QualityData>,
    { refreshInterval: 5000 }
  );
  const qualityData = swrQualityResult.data;
  const error: Error | undefined = swrQualityResult.error as Error | undefined;
  const mutate = swrQualityResult.mutate;

  // Fetch project reviews
  const { data: reviewsData } = useSWR<ReviewsData>(
    `/api/projects/${projectId}/reviews`,
    fetcher<ReviewsData>,
    { refreshInterval: 5000 }
  );

  const handleApproveWave = async (waveNumber: number) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/waves/${waveNumber}/approve`,
        { method: "POST" }
      );

      if (!response.ok) throw new Error("Failed to approve wave");

      const result = await response.json() as { nextWave?: number };
      toast.success(
        result.nextWave
          ? `Wave ${waveNumber} approved! Moving to Wave ${result.nextWave}`
          : "Wave approved!"
      );
      void mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to approve wave"
      );
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Error Loading Quality Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error.message || "Failed to load quality data"}
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

  if (!qualityData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading quality data...</p>
        </div>
      </div>
    );
  }

  const overallScore = (qualityData.overallScore as number | undefined) || 0;
  const tests = (qualityData.tests as Record<string, unknown> | undefined) || {};
  const review = (qualityData.review as Record<string, unknown> | undefined) || {};
  const security = (qualityData.security as Record<string, unknown> | undefined) || {};
  
  interface Issue {
    id: string;
    category: string;
    message: string;
    autoFixable: boolean;
    [key: string]: unknown;
  }

  function isIssue(issue: unknown): issue is Issue {
    return (
      !!issue &&
      typeof issue === "object" &&
      "id" in issue &&
      "category" in issue &&
      "message" in issue &&
      "autoFixable" in issue &&
      typeof (issue as Issue).id === "string" &&
      typeof (issue as Issue).category === "string" &&
      typeof (issue as Issue).message === "string" &&
      typeof (issue as Issue).autoFixable === "boolean"
    );
  }

  const allowedSeverities = ["low", "medium", "high", "critical"] as const;
  type Severity = typeof allowedSeverities[number];

  const issues = Array.isArray(review.issues)
    ? review.issues
        .filter(isIssue)
        .map((issue) => {
          let severity: Severity = "low";
          if ("severity" in issue && allowedSeverities.includes(issue.severity as Severity)) {
            severity = issue.severity as Severity;
          }
          return {
            id: String(issue.id),
            category: String(issue.category),
            message: String(issue.message),
            autoFixable: Boolean(issue.autoFixable),
            severity,
            file: "file" in issue ? String(issue.file) : "",
          };
        })
    : [];
  const latestReview = (reviewsData?.reviews?.[0] as Record<string, unknown> | undefined);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/projects/${projectId}/execution`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Execution
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Quality Dashboard
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Code quality, testing, and security metrics
                </p>
              </div>
            </div>
            
            {/* Navigation Links */}
            <div className="flex items-center gap-2">
              <Link href={`/projects/${projectId}/plan`}>
                <Button
                  variant="default"
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  View Plan
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/execution`}>
                <Button variant="outline" size="sm">
                  <Zap className="w-4 h-4 mr-2" />
                  Execution
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

      {/* Overall Score */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Overall Quality Score
              </p>
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold">
                  {Math.round(overallScore)}%
                </div>
                {overallScore >= 80 ? (
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Excellent</span>
                  </div>
                ) : overallScore >= 60 ? (
                  <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Good</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Needs Improvement</span>
                  </div>
                )}
              </div>
              {typeof qualityData.lastChecked === "string" ||
               typeof qualityData.lastChecked === "number" ||
               qualityData.lastChecked instanceof Date ? (
                <p className="text-xs text-muted-foreground mt-2">
                  Last checked:{" "}
                  {new Date(qualityData.lastChecked).toLocaleString()}
                </p>
              ) : null}
            </div>

            {typeof qualityData.currentWave === "number" && (
              <Button
                onClick={() => { void handleApproveWave(qualityData.currentWave as number); }}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
              >
                <>
                  <ThumbsUp className="w-4 h-4 mr-2" />
                  Approve Wave {qualityData.currentWave}
                </>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Quality Metrics Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <QualityScoreCard
            score={(tests.passed as number | undefined) && (tests.total as number | undefined) ? ((tests.passed as number) / (tests.total as number)) * 100 : 0}
            category="tests"
            details={{
              passed: (tests.passed as number | undefined) || 0,
              total: (tests.total as number | undefined) || 0,
            }}
          />
          <QualityScoreCard
            score={(review.score as number | undefined) || 0}
            category="review"
            details={{
              warnings: (review.warnings as number | undefined) || 0,
              errors: (review.errors as number | undefined) || 0,
            }}
          />
          <QualityScoreCard
            score={(security.vulnerabilities as number | undefined) === 0 ? 100 : 0}
            category="security"
            details={{
              vulnerabilities: (security.vulnerabilities as number | undefined) || 0,
            }}
          />
        </div>

        {/* Test Results */}
        {(tests.total as number | undefined) && (tests.total as number) > 0 && (
          <Card className="mb-8">
            <CardContent>
              <TestResultsViewer
                testRun={{
                  totalTests: (tests.total as number | undefined) || 0,
                  passed: (tests.passed as number | undefined) || 0,
                  failed: (tests.failed as number | undefined) || 0,
                  skipped: (tests.skipped as number | undefined) || 0,
                  duration: (tests.duration as number | undefined) || 0,
                  coverage: (tests.coverage as { lines: number; functions: number; branches: number } | undefined) || {
                    lines: 0,
                    functions: 0,
                    branches: 0,
                  },
                }}
                failedTests={
                  Array.isArray(tests.failedTests)
                    ? (tests.failedTests as unknown[]).map((t) => {
                        if (
                          typeof t === "object" &&
                          t !== null &&
                          "name" in t &&
                          "error" in t &&
                          "file" in t
                        ) {
                          const testObj = t as { name: unknown; error: unknown; file: unknown };
                          return {
                            name: String(testObj.name),
                            error: String(testObj.error),
                            file: String(testObj.file),
                          };
                        }
                        return {
                          name: "",
                          error: "",
                          file: "",
                        };
                      })
                    : undefined
                }
              />
            </CardContent>
          </Card>
        )}

        {/* Issues */}
        {issues.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Issues ({issues.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IssueList issues={issues} projectId={projectId} />
            </CardContent>
          </Card>
        )}

        {/* Wave Quality Report */}
        {latestReview && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Latest Quality Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Wave {(latestReview?.waveNumber as number | string | undefined) || "N/A"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      latestReview?.approved
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
                    }`}
                  >
                    {latestReview?.approved ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Approved
                      </>
                    ) : (
                      "Pending Review"
                    )}
                  </span>
                </div>

                {(latestReview?.reviewScore as number | undefined) !== undefined && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Review Score
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-green-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${(latestReview.reviewScore as number) * 10}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {latestReview.reviewScore as number}/10
                      </span>
                    </div>
                  </div>
                )}

                {latestReview?.feedback !== undefined && latestReview?.feedback !== null && (
                  <div>
                    <p className="text-sm font-medium mb-2">Feedback</p>
                    <p className="text-sm text-muted-foreground">
                      {typeof latestReview.feedback === "string" ||
                       typeof latestReview.feedback === "number" ||
                       typeof latestReview.feedback === "boolean"
                        ? latestReview.feedback
                        : Array.isArray(latestReview.feedback) || typeof latestReview.feedback === "object"
                          ? JSON.stringify(latestReview.feedback)
                          : ""}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {issues.length === 0 && !(tests.total as number | undefined) && !latestReview && (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Quality Data Yet</h3>
              <p className="text-muted-foreground">
                Quality metrics will appear once testing and code review are
                complete
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
