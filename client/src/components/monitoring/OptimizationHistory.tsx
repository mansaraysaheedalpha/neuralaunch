// src/components/monitoring/OptimizationHistory.tsx
"use client";

import { motion } from "framer-motion";
import { CheckCircle2, TrendingUp, Database, Image, Code } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Optimization {
  id: string;
  type: string;
  description: string;
  timestamp: Date | string;
  impact?: string;
}

interface OptimizationHistoryProps {
  optimizations: Optimization[];
}

export default function OptimizationHistory({
  optimizations,
}: OptimizationHistoryProps) {
  if (!optimizations || optimizations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No optimizations yet
      </div>
    );
  }

  const getOptimizationIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "database":
        return Database;
      case "image":
      case "asset":
        return Image;
      case "code":
        return Code;
      default:
        return TrendingUp;
    }
  };

  return (
    <div className="space-y-3">
      {optimizations.map((optimization, index) => {
        const Icon = getOptimizationIcon(optimization.type);

        return (
          <motion.div
            key={optimization.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-start gap-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
          >
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <Icon className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="font-medium text-foreground capitalize">
                  {optimization.type} Optimization
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {optimization.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(optimization.timestamp), {
                    addSuffix: true,
                  })}
                </span>
                {optimization.impact && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {optimization.impact}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
