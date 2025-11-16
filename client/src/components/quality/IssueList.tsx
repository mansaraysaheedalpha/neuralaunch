// src/components/quality/IssueList.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  CheckCircle2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

interface Issue {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
  autoFixable: boolean;
}

interface IssueListProps {
  issues: Issue[];
  projectId: string;
  onIgnore?: (issueId: string) => void;
  onFix?: (issueId: string) => void;
}

const SEVERITY_CONFIG = {
  critical: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-200 dark:border-red-900",
    label: "Critical",
  },
  high: {
    icon: AlertCircle,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    border: "border-orange-200 dark:border-orange-900",
    label: "High",
  },
  medium: {
    icon: AlertTriangle,
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950/20",
    border: "border-yellow-200 dark:border-yellow-900",
    label: "Medium",
  },
  low: {
    icon: Info,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-900",
    label: "Low",
  },
};

export default function IssueList({
  issues,
  projectId,
  onIgnore,
  onFix,
}: IssueListProps) {
  const [ignoredIssues, setIgnoredIssues] = useState<Set<string>>(new Set());
  const [fixingIssues, setFixingIssues] = useState<Set<string>>(new Set());

  const handleIgnore = (issueId: string) => {
    setIgnoredIssues((prev) => new Set(prev).add(issueId));
    onIgnore?.(issueId);
    toast.success("Issue ignored");
  };

  const handleFix = async (issue: Issue) => {
    if (!issue.autoFixable) return;

    setFixingIssues((prev) => new Set(prev).add(issue.id));

    try {
      // Call auto-fix API
      const response = await fetch(`/api/projects/${projectId}/quality/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: issue.id }),
      });

      if (!response.ok) throw new Error("Failed to fix issue");

      toast.success("Issue fixed successfully");
      onFix?.(issue.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to fix issue"
      );
    } finally {
      setFixingIssues((prev) => {
        const newSet = new Set(prev);
        newSet.delete(issue.id);
        return newSet;
      });
    }
  };

  const visibleIssues = issues.filter((issue) => !ignoredIssues.has(issue.id));

  if (visibleIssues.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
        <p className="text-sm text-muted-foreground">
          {issues.length > 0 ? "All issues ignored" : "No issues found"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visibleIssues.map((issue, index) => {
        const config = SEVERITY_CONFIG[issue.severity];
        const Icon = config.icon;
        const isFixing = fixingIssues.has(issue.id);

        return (
          <motion.div
            key={issue.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`p-4 rounded-lg border ${config.bg} ${config.border}`}
          >
            <div className="flex gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                <Icon className={`w-5 h-5 ${config.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${config.color}`}
                      >
                        {config.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {issue.category.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {issue.message}
                    </p>
                  </div>
                </div>

                {/* File Location */}
                <div className="text-xs text-muted-foreground mb-2">
                  {issue.file}
                  {issue.line && `:${issue.line}`}
                </div>

                {/* Suggestion */}
                {issue.suggestion && (
                  <div className="mt-2 p-2 rounded bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Suggestion:</span>{" "}
                      {issue.suggestion}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
                  {issue.autoFixable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { void handleFix(issue); }}
                      disabled={isFixing}
                      className="h-7 text-xs"
                    >
                      {isFixing ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          >
                            <Wrench className="w-3 h-3 mr-1" />
                          </motion.div>
                          Fixing...
                        </>
                      ) : (
                        <>
                          <Wrench className="w-3 h-3 mr-1" />
                          Auto-Fix
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleIgnore(issue.id)}
                    className="h-7 text-xs"
                  >
                    Ignore
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
