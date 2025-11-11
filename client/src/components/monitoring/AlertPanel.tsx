// src/components/monitoring/AlertPanel.tsx
"use client";

import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: Date | string;
  resolved?: boolean;
}

interface AlertPanelProps {
  alerts: Alert[];
}

export default function AlertPanel({ alerts }: AlertPanelProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No active alerts
      </div>
    );
  }

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          icon: AlertTriangle,
          color: "text-red-500",
          bgColor: "bg-red-100 dark:bg-red-900",
          borderColor: "border-red-500",
        };
      case "warning":
        return {
          icon: AlertCircle,
          color: "text-yellow-500",
          bgColor: "bg-yellow-100 dark:bg-yellow-900",
          borderColor: "border-yellow-500",
        };
      default:
        return {
          icon: Info,
          color: "text-blue-500",
          bgColor: "bg-blue-100 dark:bg-blue-900",
          borderColor: "border-blue-500",
        };
    }
  };

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => {
        const config = getSeverityConfig(alert.severity);
        const Icon = config.icon;

        return (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`border-l-4 ${config.borderColor} ${config.bgColor} p-4 rounded-r-lg`}
          >
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 ${config.color} mt-0.5 flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(alert.timestamp), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              {alert.resolved && (
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 rounded">
                  Resolved
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
