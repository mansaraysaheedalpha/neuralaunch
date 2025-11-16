"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Clock, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { logger } from "@/lib/logger";
import { toError } from "@/lib/error-utils";
import { CriticalFailure, Issue, FixAttempt } from "@/types/component-props";

interface ExtendedCriticalFailure extends CriticalFailure {
  taskId?: string;
  waveNumber?: number;
  phase?: string;
  component?: string;
  title?: string;
  description?: string;
  errorMessage?: string;
  rootCause?: string;
  lastAttemptAt?: string;
  escalatedToHuman?: boolean;
  escalatedAt?: string;
  resolutionNotes?: string;
  resolvedBy?: string;
  stackTrace?: string;
  updatedAt?: string;
}

interface CriticalFailuresPanelProps {
  projectId: string;
}

interface FailureStats {
  total: number;
  byStatus?: {
    open?: number;
    resolved?: number;
  };
}

export function CriticalFailuresPanel({ projectId }: CriticalFailuresPanelProps) {
  const [failures, setFailures] = useState<ExtendedCriticalFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [stats, setStats] = useState<FailureStats>({ total: 0 });

  const fetchFailures = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.append("status", filter);
      }

      const response = await fetch(
        `/api/projects/${projectId}/critical-failures?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch critical failures");
      }

      const data = await response.json() as { failures?: ExtendedCriticalFailure[]; stats?: FailureStats };
      setFailures(data.failures || []);
      setStats(data.stats || { total: 0 });
    } catch (error: unknown) {
      logger.error("Failed to fetch critical failures", toError(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, filter]);

  useEffect(() => {
    void fetchFailures();
  }, [fetchFailures]);

  const updateFailureStatus = async (
    failureId: string,
    status: string,
    resolutionNotes?: string
  ) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/critical-failures`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          failureId,
          status,
          resolutionNotes,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update failure status");
      }

      await fetchFailures();
    } catch (error) {
      logger.error("Failed to update failure status", toError(error));
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "resolved":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "in_review":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "dismissed":
        return <XCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Critical Failures</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Critical Failures
              </CardTitle>
              <CardDescription>
                Issues that require attention after multiple auto-fix attempts
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                All ({stats.total || 0})
              </Button>
              <Button
                variant={filter === "open" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("open")}
              >
                Open ({stats.byStatus?.open || 0})
              </Button>
              <Button
                variant={filter === "resolved" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("resolved")}
              >
                Resolved ({stats.byStatus?.resolved || 0})
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {failures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            {filter === "all" ? (
              <div>
                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-600" />
                <p className="font-medium">No critical failures found</p>
                <p className="text-sm">All issues have been successfully resolved!</p>
              </div>
            ) : (
              <p>No {filter} failures found</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {failures.map((failure) => (
            <Card key={failure.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusIcon(failure.status)}
                      <h3 className="font-semibold text-lg">{failure.title}</h3>
                      <Badge variant="outline" className={getSeverityColor(failure.severity || "medium")}>
                        {failure.severity || "medium"}
                      </Badge>
                      {failure.waveNumber && (
                        <Badge variant="outline">Wave {failure.waveNumber}</Badge>
                      )}
                      {failure.component && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {failure.component}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{failure.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>
                        {failure.totalAttempts || 0} attempt{(failure.totalAttempts || 0) > 1 ? "s" : ""}
                      </span>
                      <span>•</span>
                      <span>
                        {failure.issuesRemaining?.length || 0} issue
                        {failure.issuesRemaining?.length !== 1 ? "s" : ""} remaining
                      </span>
                      <span>•</span>
                      <span>
                        Created {new Date(failure.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setExpandedId(expandedId === failure.id ? null : failure.id)
                    }
                  >
                    {expandedId === failure.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>

              {expandedId === failure.id && (
                <CardContent className="border-t bg-gray-50 space-y-4">
                  {/* Error Details */}
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Error Message</h4>
                    <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
                      {failure.errorMessage}
                    </pre>
                  </div>

                  {/* Root Cause */}
                  {failure.rootCause && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Root Cause</h4>
                      <p className="text-sm text-gray-700 bg-white p-3 rounded border">
                        {failure.rootCause}
                      </p>
                    </div>
                  )}

                  {/* Issues Remaining */}
                  {failure.issuesRemaining && failure.issuesRemaining.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">
                        Issues Remaining ({failure.issuesRemaining.length})
                      </h4>
                      <div className="space-y-2">
                        {failure.issuesRemaining.slice(0, 5).map((issue: Issue, idx: number) => (
                          <div
                            key={idx}
                            className="text-sm bg-white p-3 rounded border"
                          >
                            {typeof issue === "string" ? issue : issue.description || JSON.stringify(issue)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attempt History */}
                  {failure.attemptHistory && failure.attemptHistory.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">
                        Attempt History ({failure.attemptHistory.length})
                      </h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {failure.attemptHistory.map((attempt: FixAttempt, idx: number) => (
                          <div
                            key={idx}
                            className="text-xs bg-white p-3 rounded border"
                          >
                            <div className="font-medium mb-1">
                              Attempt {attempt.attemptNumber || idx + 1}
                              {attempt.timestamp && (
                                <span className="text-gray-500 ml-2">
                                  {new Date(attempt.timestamp).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {Boolean((attempt as Record<string, unknown>).error) && (
                              <div className="text-gray-600 mt-1">{String((attempt as Record<string, unknown>).error)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stack Trace */}
                  {failure.stackTrace && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Stack Trace</h4>
                      <pre className="text-xs bg-white p-3 rounded border overflow-x-auto max-h-60">
                        {failure.stackTrace}
                      </pre>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {failure.status === "open" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void updateFailureStatus(failure.id, "in_review"); }}
                        >
                          Mark In Review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const notes = prompt("Resolution notes (optional):");
                            void updateFailureStatus(failure.id, "resolved", notes || undefined);
                          }}
                        >
                          Mark Resolved
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void updateFailureStatus(failure.id, "dismissed"); }}
                        >
                          Dismiss
                        </Button>
                      </>
                    )}
                    {failure.status === "resolved" && failure.resolutionNotes && (
                      <div className="text-sm text-gray-600 bg-green-50 p-3 rounded border border-green-200">
                        <strong>Resolution:</strong> {failure.resolutionNotes}
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
