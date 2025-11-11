// src/components/quality/TestResultsViewer.tsx
"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  Activity,
  Clock,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface TestResultsViewerProps {
  testRun: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    coverage: {
      lines: number;
      functions: number;
      branches: number;
    };
  };
  failedTests?: Array<{
    name: string;
    error: string;
    file: string;
  }>;
}

export default function TestResultsViewer({
  testRun,
  failedTests,
}: TestResultsViewerProps) {
  const { totalTests, passed, failed, skipped, duration, coverage } = testRun;
  const passRate = totalTests > 0 ? (passed / totalTests) * 100 : 0;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="text-center p-4 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold text-foreground">{totalTests}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Tests</div>
        </div>

        <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
          <div className="flex items-center justify-center gap-1">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {passed}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Passed</div>
        </div>

        <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center justify-center gap-1">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {failed}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Failed</div>
        </div>

        <div className="text-center p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
          <div className="flex items-center justify-center gap-1">
            <MinusCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {skipped}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Skipped</div>
        </div>

        <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20">
          <div className="flex items-center justify-center gap-1">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatDuration(duration)}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Duration</div>
        </div>
      </div>

      {/* Pass Rate */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Pass Rate</span>
          <span
            className={`text-sm font-medium ${
              passRate >= 80
                ? "text-green-600 dark:text-green-400"
                : passRate >= 60
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {Math.round(passRate)}%
          </span>
        </div>
        <Progress value={passRate} className="h-3" />
      </div>

      {/* Coverage */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Code Coverage
        </h3>
        <div className="space-y-3">
          {/* Lines Coverage */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Lines</span>
              <span className="font-medium">{Math.round(coverage.lines)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                initial={{ width: 0 }}
                animate={{ width: `${coverage.lines}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Functions Coverage */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Functions</span>
              <span className="font-medium">
                {Math.round(coverage.functions)}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                initial={{ width: 0 }}
                animate={{ width: `${coverage.functions}%` }}
                transition={{ duration: 0.5, delay: 0.1 }}
              />
            </div>
          </div>

          {/* Branches Coverage */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Branches</span>
              <span className="font-medium">
                {Math.round(coverage.branches)}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                initial={{ width: 0 }}
                animate={{ width: `${coverage.branches}%` }}
                transition={{ duration: 0.5, delay: 0.2 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Failed Tests */}
      {failedTests && failedTests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            Failed Tests ({failedTests.length})
          </h3>
          <div className="space-y-2">
            {failedTests.map((test, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900"
              >
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground mb-1">
                      {test.name}
                    </p>
                    <p className="text-xs text-muted-foreground mb-1">
                      {test.file}
                    </p>
                    <div className="p-2 rounded bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-900">
                      <p className="text-xs text-red-800 dark:text-red-200 font-mono whitespace-pre-wrap">
                        {test.error}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
