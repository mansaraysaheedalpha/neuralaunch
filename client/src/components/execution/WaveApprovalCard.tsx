// src/components/execution/WaveApprovalCard.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  GitMerge,
  Rocket,
  Loader2,
  Star,
  FileCode,
  TestTube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import toast from "react-hot-toast";

interface WaveApprovalCardProps {
  projectId: string;
  waveNumber: number;
  conversationId: string;
  status: {
    readyForApproval: boolean;
    tasks: {
      total: number;
      completed: number;
      failed: number;
    };
    quality: {
      averageScore: number;
      criticalIssues: number;
      hasCriticalIssues: boolean;
    };
    prInfo: {
      prUrl: string;
      prNumber: number;
    } | null;
  };
  onApprovalComplete?: () => void;
  className?: string;
}

export function WaveApprovalCard({
  projectId,
  waveNumber,
  conversationId,
  status,
  onApprovalComplete,
  className = "",
}: WaveApprovalCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [mergePR, setMergePR] = useState(true);
  const [continueToNextWave, setContinueToNextWave] = useState(true);

  const handleApprove = async () => {
    setIsApproving(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/waves/${waveNumber}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            mergePR,
            continueToNextWave,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to approve wave");
      }

      toast.success(`Wave Approved! ${data.message}`, {
        duration: 5000,
        position: "top-right",
      });

      onApprovalComplete?.();
    } catch (error) {
      toast.error(
        `Approval Failed: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        {
          duration: 5000,
          position: "top-right",
        }
      );
    } finally {
      setIsApproving(false);
    }
  };

  const qualityScore = status.quality.averageScore;
  const isHighQuality = qualityScore >= 80;
  const isMediumQuality = qualityScore >= 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card className="border-2 border-primary/20 shadow-lg">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-primary" />
                Wave {waveNumber} - Ready for Review
              </CardTitle>
              <CardDescription className="mt-1">
                All tasks completed. Review the changes and approve to continue.
              </CardDescription>
            </div>
            <Badge
              variant={status.readyForApproval ? "default" : "secondary"}
              className="ml-2"
            >
              {status.readyForApproval ? "Ready" : "Pending"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Task Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <FileCode className="w-4 h-4" />
                <span>Total Tasks</span>
              </div>
              <p className="text-2xl font-bold">{status.tasks.total}</p>
            </div>
            <div className="rounded-lg border p-3 bg-green-50/50 dark:bg-green-950/20">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Completed</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {status.tasks.completed}
              </p>
            </div>
            {status.tasks.failed > 0 && (
              <div className="rounded-lg border p-3 bg-red-50/50 dark:bg-red-950/20">
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mb-1">
                  <XCircle className="w-4 h-4" />
                  <span>Failed</span>
                </div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {status.tasks.failed}
                </p>
              </div>
            )}
          </div>

          {/* Quality Score */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star
                  className={`w-5 h-5 ${isHighQuality ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`}
                />
                <span className="font-medium">Code Quality Score</span>
              </div>
              <Badge
                variant={
                  isHighQuality
                    ? "default"
                    : isMediumQuality
                      ? "secondary"
                      : "destructive"
                }
                className="text-lg px-3"
              >
                {qualityScore}/100
              </Badge>
            </div>

            {/* Quality Bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${qualityScore}%` }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className={`h-full ${
                  isHighQuality
                    ? "bg-green-500"
                    : isMediumQuality
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              />
            </div>

            {/* Critical Issues */}
            {status.quality.hasCriticalIssues && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {status.quality.criticalIssues} critical{" "}
                  {status.quality.criticalIssues === 1 ? "issue" : "issues"}{" "}
                  found. Review carefully before approving.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Pull Request Link */}
          {status.prInfo && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium mb-1">Pull Request</p>
                  <p className="text-sm text-muted-foreground">
                    PR #{status.prInfo.prNumber}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a
                    href={status.prInfo.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on GitHub
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
              </div>
            </div>
          )}

          {/* Approval Options */}
          <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
            <p className="text-sm font-medium">Approval Options</p>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="merge-pr"
                checked={mergePR}
                onCheckedChange={(checked) => setMergePR(checked as boolean)}
                disabled={!status.prInfo}
              />
              <label
                htmlFor="merge-pr"
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Auto-merge pull request after approval
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="continue-wave"
                checked={continueToNextWave}
                onCheckedChange={(checked) =>
                  setContinueToNextWave(checked as boolean)
                }
              />
              <label
                htmlFor="continue-wave"
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Automatically start next wave
              </label>
            </div>
          </div>

          {/* Approval Button */}
          <Button
            onClick={handleApprove}
            disabled={!status.readyForApproval || isApproving}
            size="lg"
            className="w-full"
          >
            {isApproving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Approving...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 mr-2" />
                Approve Wave {waveNumber}
              </>
            )}
          </Button>

          {!status.readyForApproval && (
            <p className="text-xs text-center text-muted-foreground">
              Wave must be completed before approval
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * Skeleton loader for wave approval card
 */
export function WaveApprovalCardSkeleton() {
  return (
    <Card className="border-2 border-muted">
      <CardHeader>
        <div className="space-y-2">
          <div className="h-6 bg-muted rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="h-4 bg-muted rounded w-20 mb-2 animate-pulse" />
              <div className="h-8 bg-muted rounded w-12 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-32 bg-muted rounded animate-pulse" />
        <div className="h-10 bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}
