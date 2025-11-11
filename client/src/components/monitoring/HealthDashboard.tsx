// src/components/monitoring/HealthDashboard.tsx
"use client";

import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";

interface HealthDashboardProps {
  health: "healthy" | "degraded" | "down";
  uptime?: number;
}

export default function HealthDashboard({
  health,
  uptime = 0,
}: HealthDashboardProps) {
  const config = {
    healthy: {
      icon: CheckCircle2,
      label: "Healthy",
      color: "text-green-500",
      bgColor: "bg-green-100 dark:bg-green-900",
    },
    degraded: {
      icon: AlertCircle,
      label: "Degraded",
      color: "text-yellow-500",
      bgColor: "bg-yellow-100 dark:bg-yellow-900",
    },
    down: {
      icon: XCircle,
      label: "Down",
      color: "text-red-500",
      bgColor: "bg-red-100 dark:bg-red-900",
    },
  };

  const { icon: Icon, label, color, bgColor } = config[health];

  return (
    <div className={`flex items-center gap-4 p-4 rounded-lg ${bgColor}`}>
      <Icon className={`w-8 h-8 ${color}`} />
      <div>
        <h3 className={`text-lg font-semibold ${color}`}>{label}</h3>
        <p className="text-sm text-muted-foreground">
          Uptime: {(uptime * 100).toFixed(2)}%
        </p>
      </div>
    </div>
  );
}
