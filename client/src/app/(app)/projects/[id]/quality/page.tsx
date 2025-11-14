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
  FileCheck,
  Loader2,
  ThumbsUp,
  Rocket,
  Activity,
  Zap,
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

const fetcher = async <T = unknown>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    // Check if response is JSON
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const errorData = await res.json();
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

export default function QualityDashboardPage({ params }: QualityPageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();

  // Fetch project quality data
  const { data: qualityData, error, mutate } = useSWR<any>(
    `/api/projects/${projectId}/quality`,
    fetcher,
    { refreshInterval: 5000 }
  );

  // Fetch project reviews
  const { data: reviewsData } = useSWR<any>(
    `/api/projects/${projectId}/reviews`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const handleApproveWave = async (waveNumber: number) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/waves/${waveNumber}/approve`,
        { method: "POST" }
      );

      if (!response.ok) throw new Error("Failed to approve wave");

      const result = await response.json();
      toast.success(
        result.nextWave
          ? `Wave ${waveNumber} approved! Moving to Wave ${result.nextWave}`
          : "Wave approved!"
      );
      mutate();
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

  const overallScore = qualityData.overallScore || 0;
  const tests = qualityData.tests || {};
  const review = qualityData.review || {};
  const security = qualityData.security || {};
  const issues = review.issues || [];
  const latestReview = reviewsData?.reviews?.[0];

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
              {qualityData.lastChecked && (
                <p className="text-xs text-muted-foreground mt-2">
                  Last checked:{" "}
                  {new Date(qualityData.lastChecked).toLocaleString()}
                </p>
              )}
            </div>

            {qualityData.currentWave && (
              <Button
                onClick={() => handleApproveWave(qualityData.currentWave)}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
              >
                <ThumbsUp className="w-4 h-4 mr-2" />
                Approve Wave {qualityData.currentWave}
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
            score={tests.passed && tests.total ? (tests.passed / tests.total) * 100 : 0}
            category="tests"
            details={{
              passed: tests.passed || 0,
              total: tests.total || 0,
            }}
          />
          <QualityScoreCard
            score={review.score || 0}
            category="review"
            details={{
              warnings: review.warnings || 0,
              errors: review.errors || 0,
            }}
          />
          <QualityScoreCard
            score={security.vulnerabilities === 0 ? 100 : 0}
            category="security"
            details={{
              vulnerabilities: security.vulnerabilities || 0,
            }}
          />
        </div>

        {/* Test Results */}
        {tests.total > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="w-5 h-5" />
                Test Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TestResultsViewer
                testRun={{
                  totalTests: tests.total || 0,
                  passed: tests.passed || 0,
                  failed: tests.failed || 0,
                  skipped: tests.skipped || 0,
                  duration: tests.duration || 0,
                  coverage: tests.coverage || {
                    lines: 0,
                    functions: 0,
                    branches: 0,
                  },
                }}
                failedTests={tests.failedTests}
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
                    Wave {latestReview.waveNumber || "N/A"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      latestReview.approved
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
                    }`}
                  >
                    {latestReview.approved ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Approved
                      </>
                    ) : (
                      "Pending Review"
                    )}
                  </span>
                </div>

                {latestReview.reviewScore !== undefined && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Review Score
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-green-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${latestReview.reviewScore * 10}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {latestReview.reviewScore}/10
                      </span>
                    </div>
                  </div>
                )}

                {latestReview.feedback && (
                  <div>
                    <p className="text-sm font-medium mb-2">Feedback</p>
                    <p className="text-sm text-muted-foreground">
                      {latestReview.feedback}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {issues.length === 0 && tests.total === 0 && !latestReview && (
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
