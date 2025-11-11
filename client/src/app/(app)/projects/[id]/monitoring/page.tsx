// src/app/(app)/projects/[id]/monitoring/page.tsx
"use client";

import { use } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import HealthDashboard from "@/components/monitoring/HealthDashboard";
import MetricsChart from "@/components/monitoring/MetricsChart";
import AlertPanel from "@/components/monitoring/AlertPanel";
import OptimizationHistory from "@/components/monitoring/OptimizationHistory";

interface MonitoringPageProps {
  params: Promise<{
    id: string;
  }>;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function MonitoringDashboardPage({
  params,
}: MonitoringPageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();

  // Fetch monitoring data
  const { data: monitoringData, error } = useSWR(
    `/api/projects/${projectId}/monitoring`,
    fetcher,
    { refreshInterval: 10000 } // Refresh every 10 seconds
  );

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Error Loading Monitoring Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error.message || "Failed to load monitoring data"}
            </p>
            <Button onClick={() => router.push("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!monitoringData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  const health = monitoringData.health || "healthy";
  const metrics = monitoringData.metrics || {};
  const alerts = monitoringData.alerts || [];
  const optimizations = monitoringData.optimizations || [];

  const healthConfig = {
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
      icon: AlertCircle,
      label: "Down",
      color: "text-red-500",
      bgColor: "bg-red-100 dark:bg-red-900",
    },
  };

  const config = healthConfig[health as keyof typeof healthConfig] || healthConfig.healthy;
  const HealthIcon = config.icon;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/projects/${projectId}/execution`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Execution
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Application Monitoring
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Real-time health and performance metrics
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Health Status Banner */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full ${config.bgColor}`}>
              <HealthIcon className={`w-6 h-6 ${config.color}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold">
                Application Status: {config.label}
              </h2>
              {metrics.uptime !== undefined && (
                <p className="text-sm text-muted-foreground">
                  Uptime: {(metrics.uptime * 100).toFixed(2)}%
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Key Metrics Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Response Time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-5 h-5 text-primary" />
                Response Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold">
                  {metrics.responseTime?.avg || 0}ms
                </div>
                <p className="text-sm text-muted-foreground">Average</p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>P95: {metrics.responseTime?.p95 || 0}ms</span>
                  <span>P99: {metrics.responseTime?.p99 || 0}ms</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="w-5 h-5 text-red-500" />
                Error Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold">
                  {(metrics.errorRate * 100 || 0).toFixed(2)}%
                </div>
                <p className="text-sm text-muted-foreground">Last 24 hours</p>
                {metrics.errorRate < 0.01 ? (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Low error rate</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-yellow-600">
                    <AlertCircle className="w-3 h-3" />
                    <span>Monitor closely</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold">
                  {(metrics.requests24h || 0).toLocaleString()}
                </div>
                <p className="text-sm text-muted-foreground">Last 24 hours</p>
                <p className="text-xs text-muted-foreground">
                  ~{Math.round((metrics.requests24h || 0) / 24)} req/hour
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Metrics Chart */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Performance Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MetricsChart projectId={projectId} />
          </CardContent>
        </Card>

        {/* Alerts Panel */}
        {alerts.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
                Active Alerts ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AlertPanel alerts={alerts} />
            </CardContent>
          </Card>
        )}

        {/* Optimization History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" />
              Recent Optimizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OptimizationHistory optimizations={optimizations} />
          </CardContent>
        </Card>

        {/* No Alerts State */}
        {alerts.length === 0 && (
          <Card className="mt-8">
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold mb-2">No Active Alerts 🎉</h3>
              <p className="text-muted-foreground">
                Your application is running smoothly
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
