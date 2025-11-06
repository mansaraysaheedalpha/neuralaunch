// src/components/agent/ActionableTaskItem.tsx
"use client";

import { motion } from "framer-motion";
import { FileCode, CheckCircle, AlertTriangle, Info } from "lucide-react";
import type { ActionableTask } from "@/types/agent-schemas";

interface ActionableTaskItemProps {
  task: ActionableTask;
  index: number;
}

export default function ActionableTaskItem({
  task,
  index,
}: ActionableTaskItemProps) {
  const complexityColors = {
    low: "text-green-600 dark:text-green-400 bg-green-500/10",
    medium: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10",
    high: "text-red-600 dark:text-red-400 bg-red-500/10",
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative pl-8 pb-6 border-l-2 border-border last:pb-0"
    >
      {/* Step Number Badge */}
      <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
        {index + 1}
      </div>

      {/* Task Card */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
        {/* Header: Task Title + Complexity */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <h4 className="text-sm font-semibold text-foreground flex-1">
            {task.task}
          </h4>
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              complexityColors[task.estimatedComplexity]
            }`}
          >
            {task.estimatedComplexity}
          </span>
        </div>

        {/* Rationale */}
        <p className="text-xs text-muted-foreground mb-3 italic">
          <Info className="w-3 h-3 inline mr-1" />
          {task.rationale}
        </p>

        {/* Files to Create/Modify */}
        {task.files && task.files.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
              <FileCode className="w-3 h-3" />
              Files:
            </p>
            <div className="flex flex-wrap gap-1">
              {task.files.map((file, i) => (
                <code
                  key={i}
                  className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground"
                >
                  {file}
                </code>
              ))}
            </div>
          </div>
        )}

        {/* Pattern */}
        <div className="mb-3">
          <p className="text-xs font-medium text-foreground mb-1">Pattern:</p>
          <p className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            {task.pattern}
          </p>
        </div>

        {/* Verification Commands */}
        {task.verification && task.verification.commands.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Verification:
            </p>
            <div className="space-y-1">
              {task.verification.commands.map((cmd, i) => (
                <code
                  key={i}
                  className="block text-xs bg-slate-900 text-green-400 px-2 py-1 rounded font-mono"
                >
                  $ {cmd}
                </code>
              ))}
              <p className="text-xs text-muted-foreground mt-1">
                ✓ {task.verification.successCriteria}
              </p>
            </div>
          </div>
        )}

        {/* Security Notes */}
        {task.security && task.security.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              Security:
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-4">
              {task.security.map((note, i) => (
                <li key={i} className="list-disc">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* UI Details (if applicable) */}
        {task.uiDetails && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-medium text-primary mb-1">UI/UX:</p>
            <p className="text-xs text-muted-foreground">{task.uiDetails}</p>
          </div>
        )}

        {/* Dependencies */}
        {task.dependencies && task.dependencies.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Depends on steps:{" "}
              {task.dependencies.map((dep) => dep + 1).join(", ")}
            </p>
          </div>
        )}
      </div>
    </motion.li>
  );
}
