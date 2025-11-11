// src/components/deployment/DeploymentHistory.tsx
"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  GitCommit,
  Globe,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Deployment {
  id: string;
  environment: string;
  status: string;
  createdAt: Date | string;
  deployedAt?: Date | string;
  commitMessage?: string;
  commitHash?: string;
  platform?: string;
  url?: string;
}

interface DeploymentHistoryProps {
  deployments: Deployment[];
}

export default function DeploymentHistory({
  deployments,
}: DeploymentHistoryProps) {
  if (!deployments || deployments.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">No deployments yet</p>
      </div>
    );
  }

  // Sort by created date, newest first
  const sortedDeployments = [...deployments].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "live":
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "deploying":
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="w-5 h-5 text-blue-500" />
          </motion.div>
        );
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live":
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100";
      case "deploying":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100";
    }
  };

  return (
    <div className="space-y-3">
      {sortedDeployments.map((deployment, index) => (
        <motion.div
          key={deployment.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
        >
          <div className="flex items-start gap-4">
            {/* Status Icon */}
            <div className="mt-1">{getStatusIcon(deployment.status)}</div>

            {/* Deployment Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                    deployment.status
                  )}`}
                >
                  {deployment.environment}
                </span>
                <span className="text-xs text-muted-foreground">
                  #{deployment.id.slice(-8)}
                </span>
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Clock className="w-4 h-4" />
                {deployment.deployedAt ? (
                  <span>
                    Deployed{" "}
                    {formatDistanceToNow(new Date(deployment.deployedAt), {
                      addSuffix: true,
                    })}
                  </span>
                ) : (
                  <span>
                    Created{" "}
                    {formatDistanceToNow(new Date(deployment.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>

              {/* Commit Info */}
              {deployment.commitMessage && (
                <div className="flex items-start gap-2 text-sm mb-2">
                  <GitCommit className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground truncate">
                    {deployment.commitMessage}
                  </span>
                </div>
              )}

              {/* Platform and URL */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {deployment.platform && (
                  <span className="capitalize">
                    Platform: {deployment.platform}
                  </span>
                )}
                {deployment.url && (
                  <a
                    href={deployment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <Globe className="w-3 h-3" />
                    View
                  </a>
                )}
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex items-center">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(
                  deployment.status
                )}`}
              >
                {deployment.status}
              </span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
