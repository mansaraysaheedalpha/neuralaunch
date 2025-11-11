// src/components/quality/QualityScoreCard.tsx
"use client";

import { motion } from "framer-motion";
import { CheckCircle2, FileCheck, Shield, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface QualityScoreCardProps {
  score: number; // 0-100
  category: "tests" | "review" | "security" | "coverage";
  details: {
    passed?: number;
    total?: number;
    warnings?: number;
    errors?: number;
    vulnerabilities?: number;
  };
}

const CATEGORY_CONFIG = {
  tests: {
    icon: CheckCircle2,
    label: "Tests",
    color: "from-green-500 to-emerald-500",
  },
  review: {
    icon: FileCheck,
    label: "Code Review",
    color: "from-blue-500 to-cyan-500",
  },
  security: {
    icon: Shield,
    label: "Security",
    color: "from-purple-500 to-pink-500",
  },
  coverage: {
    icon: Activity,
    label: "Coverage",
    color: "from-orange-500 to-red-500",
  },
};

export default function QualityScoreCard({
  score,
  category,
  details,
}: QualityScoreCardProps) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-100 dark:bg-green-950";
    if (score >= 60) return "bg-yellow-100 dark:bg-yellow-950";
    return "bg-red-100 dark:bg-red-950";
  };

  return (
    <Card className="relative overflow-hidden">
      {/* Gradient Background */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${config.color} opacity-5`}
      />

      <CardContent className="pt-6 pb-4 relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${config.color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <h3 className="font-semibold">{config.label}</h3>
        </div>

        {/* Score */}
        <div className="flex items-baseline gap-2 mb-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className={`text-4xl font-bold ${getScoreColor(score)}`}
          >
            {Math.round(score)}%
          </motion.div>
          <div className={`px-2 py-1 rounded-full ${getScoreBg(score)}`}>
            <span
              className={`text-xs font-medium ${getScoreColor(score)}`}
            >
              {score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Fair"}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden mb-4">
          <motion.div
            className={`h-full bg-gradient-to-r ${config.color}`}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.5, delay: 0.2 }}
          />
        </div>

        {/* Details */}
        <div className="space-y-2">
          {category === "tests" && details.total !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Passed</span>
              <span className="font-medium">
                {details.passed || 0} / {details.total}
              </span>
            </div>
          )}

          {category === "review" && (
            <>
              {details.warnings !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Warnings</span>
                  <span
                    className={
                      details.warnings > 0
                        ? "text-yellow-600 dark:text-yellow-400 font-medium"
                        : "font-medium"
                    }
                  >
                    {details.warnings}
                  </span>
                </div>
              )}
              {details.errors !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Errors</span>
                  <span
                    className={
                      details.errors > 0
                        ? "text-red-600 dark:text-red-400 font-medium"
                        : "font-medium"
                    }
                  >
                    {details.errors}
                  </span>
                </div>
              )}
            </>
          )}

          {category === "security" && details.vulnerabilities !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vulnerabilities</span>
              <span
                className={
                  details.vulnerabilities > 0
                    ? "text-red-600 dark:text-red-400 font-medium"
                    : "text-green-600 dark:text-green-400 font-medium"
                }
              >
                {details.vulnerabilities === 0 ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    None
                  </span>
                ) : (
                  details.vulnerabilities
                )}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
