// src/components/deployment/DeploymentCard.tsx
"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Globe,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface DeploymentCardProps {
  deployment: {
    environment: "preview" | "production";
    status: "deploying" | "live" | "failed";
    url?: string;
    platform: string;
    deployedAt?: Date;
    duration?: number;
  };
  onRedeploy?: () => void;
  onRollback?: () => void;
}

export default function DeploymentCard({
  deployment,
  onRedeploy,
  onRollback,
}: DeploymentCardProps) {
  const statusConfig = {
    deploying: {
      icon: Loader2,
      label: "Deploying",
      color: "text-blue-500",
      bgColor: "bg-blue-100 dark:bg-blue-900",
      animate: true,
    },
    live: {
      icon: CheckCircle2,
      label: "Live",
      color: "text-green-500",
      bgColor: "bg-green-100 dark:bg-green-900",
      animate: false,
    },
    failed: {
      icon: AlertCircle,
      label: "Failed",
      color: "text-red-500",
      bgColor: "bg-red-100 dark:bg-red-900",
      animate: false,
    },
  };

  const config = statusConfig[deployment.status];
  const StatusIcon = config.icon;

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <div
        className={`flex items-center gap-3 p-3 rounded-lg ${config.bgColor}`}
      >
        {config.animate ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <StatusIcon className={`w-5 h-5 ${config.color}`} />
          </motion.div>
        ) : (
          <StatusIcon className={`w-5 h-5 ${config.color}`} />
        )}
        <div className="flex-1">
          <p className={`font-semibold ${config.color}`}>{config.label}</p>
          {deployment.deployedAt && (
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(deployment.deployedAt, { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {/* Deployment Info */}
      <div className="space-y-3">
        {deployment.url && (
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
              URL
            </label>
            <a
              href={deployment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Globe className="w-4 h-4" />
              {deployment.url}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Platform
          </label>
          <p className="text-sm font-medium capitalize">
            {deployment.platform}
          </p>
        </div>

        {deployment.duration && (
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
              Deployment Time
            </label>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span>{formatDuration(deployment.duration)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {onRedeploy && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRedeploy}
            disabled={deployment.status === "deploying"}
            className="flex-1"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Redeploy
          </Button>
        )}
        {deployment.url && (
          <Button
            variant="outline"
            size="sm"
            asChild
            className="flex-1"
          >
            <a href={deployment.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              View Site
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
