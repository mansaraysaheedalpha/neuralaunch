// src/lib/agents/monitoring/monitoring-agent.ts
/**
 * Monitoring Agent - Production Health & Performance Monitoring
 *
 * Responsibilities:
 * 1. Track application health and uptime
 * 2. Monitor API endpoint response times
 * 3. Detect and alert on errors
 * 4. Track performance metrics
 * 5. Analyze logs for issues
 * 6. Provide optimization recommendations
 * 7. Set up synthetic monitoring
 *
 * Truly generic - works with ANY deployed application
 */

import { AI_MODELS } from "@/lib/models";
import {
  BaseAgent,
  BaseAgentConfig,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

// ==========================================
// TYPES
// ==========================================

export interface HealthCheck {
  url: string;
  status: "healthy" | "degraded" | "down";
  responseTime: number;
  statusCode?: number;
  error?: string;
  timestamp: Date;
}

export interface PerformanceMetric {
  metric: string;
  value: number;
  unit: string;
  threshold?: number;
  status: "good" | "warning" | "critical";
  timestamp: Date;
}

export interface ErrorLog {
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  stackTrace?: string;
  endpoint?: string;
  userId?: string;
  timestamp: Date;
  count: number;
}

export interface MonitoringAlert {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  metric?: string;
  currentValue?: number;
  threshold?: number;
  recommendation: string;
  timestamp: Date;
}

export interface OptimizationRecommendation {
  category: "performance" | "reliability" | "cost" | "security";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  effort: string;
  implementation: string;
}

export interface MonitoringReport {
  healthStatus: "healthy" | "degraded" | "down";
  uptime: number; // percentage
  healthChecks: HealthCheck[];
  performanceMetrics: PerformanceMetric[];
  errorLogs: ErrorLog[];
  alerts: MonitoringAlert[];
  recommendations: OptimizationRecommendation[];
  summary: string;
}

export interface MonitoringInput extends AgentExecutionInput {
  deploymentUrl: string;
  monitoringDuration?: number; // minutes, default 5
  endpoints?: string[]; // Specific endpoints to monitor
  checkInterval?: number; // seconds, default 30
}

// ==========================================
// MONITORING AGENT CLASS
// ==========================================

export class MonitoringAgent extends BaseAgent {
  // Health thresholds
  private readonly RESPONSE_TIME_WARNING = 1000; // ms
  private readonly RESPONSE_TIME_CRITICAL = 3000; // ms
  private readonly ERROR_RATE_WARNING = 0.05; // 5%
  private readonly ERROR_RATE_CRITICAL = 0.1; // 10%
  private readonly MIN_UPTIME = 0.95; // 95%

  constructor() {
    super({
      name: "MonitoringAgent",
      category: "quality",
      description:
        "Monitor production health, performance, and errors for all deployments",
      supportedTaskTypes: [
        "health_monitoring",
        "performance_monitoring",
        "error_tracking",
        "uptime_monitoring",
      ],
      requiredTools: [
        "filesystem",
        "command",
        "web_search", // For finding monitoring best practices
      ],
      modelName: AI_MODELS.OPENAI, // GPT-4o for intelligent log analysis
    });
  }

  /**
   * Execute monitoring task
   */
  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const startTime = Date.now();
    const { taskId, projectId, userId, taskDetails } = input;
    const monitoringInput = taskDetails as unknown as MonitoringInput;

    logger.info(`[${this.name}] Starting monitoring`, {
      taskId,
      deploymentUrl: monitoringInput.deploymentUrl,
      duration: monitoringInput.monitoringDuration || 5,
    });

    try {
      const deploymentUrl = monitoringInput.deploymentUrl;
      const duration = (monitoringInput.monitoringDuration || 5) * 60 * 1000; // Convert to ms
      const interval = (monitoringInput.checkInterval || 30) * 1000; // Convert to ms

      // Step 1: Discover endpoints to monitor
      const endpoints = await this.discoverEndpoints(
        projectId,
        userId,
        deploymentUrl,
        monitoringInput.endpoints
      );

      // Step 2: Run continuous health checks
      const healthChecks = await this.runHealthChecks(
        deploymentUrl,
        endpoints,
        duration,
        interval
      );

      // Step 3: Collect performance metrics
      const performanceMetrics = await this.collectPerformanceMetrics(
        healthChecks,
        deploymentUrl
      );

      // Step 4: Analyze for errors
      const errorLogs = await this.analyzeErrorLogs(
        projectId,
        userId,
        deploymentUrl
      );

      // Step 5: Generate alerts based on thresholds
      const alerts = await this.generateAlerts(
        healthChecks,
        performanceMetrics,
        errorLogs
      );

      // Step 6: Calculate uptime
      const uptime = this.calculateUptime(healthChecks);

      // Step 7: Determine overall health status
      const healthStatus = this.determineHealthStatus(
        healthChecks,
        performanceMetrics,
        errorLogs,
        uptime
      );

      // Step 8: Generate optimization recommendations
      const recommendations = await this.generateRecommendations(
        healthChecks,
        performanceMetrics,
        errorLogs,
        deploymentUrl
      );

      // Step 9: Generate AI summary
      const summary = await this.generateSummary(
        healthStatus,
        uptime,
        healthChecks,
        performanceMetrics,
        errorLogs,
        alerts
      );

      const report: MonitoringReport = {
        healthStatus,
        uptime,
        healthChecks,
        performanceMetrics,
        errorLogs,
        alerts,
        recommendations,
        summary,
      };

      // Step 10: Store monitoring report
      await this.storeMonitoringReport(taskId, projectId, report);

      // Step 11: Send alerts if critical
      if (alerts.some((a) => a.severity === "critical")) {
        await this.sendCriticalAlerts(projectId, userId, alerts);
      }

      logger.info(`[${this.name}] Monitoring complete`, {
        taskId,
        healthStatus,
        uptime: `${uptime.toFixed(2)}%`,
        alerts: alerts.length,
        criticalAlerts: alerts.filter((a) => a.severity === "critical").length,
      });

      return {
        success: true,
        message: `Monitoring complete - Status: ${healthStatus}, Uptime: ${uptime.toFixed(2)}%`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        data: { ...report },
      };
    } catch (error) {
      logger.error(`[${this.name}] Monitoring failed`, 
        error instanceof Error ? error : new Error(String(error)),
        { taskId }
      );

      return {
        success: false,
        message: `Monitoring failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: error instanceof Error ? error.message : "Unknown error",
      } as AgentExecutionOutput;
    }
  }

  /**
   * Discover endpoints to monitor
   */
  private async discoverEndpoints(
    projectId: string,
    userId: string,
    deploymentUrl: string,
    specificEndpoints?: string[]
  ): Promise<string[]> {
    logger.info(`[${this.name}] Discovering endpoints`);

    // If specific endpoints provided, use those
    if (specificEndpoints && specificEndpoints.length > 0) {
      return specificEndpoints.map((ep) => `${deploymentUrl}${ep}`);
    }

    // Otherwise, discover from project
    const endpoints: string[] = [deploymentUrl]; // Always monitor root

    // Try to discover API endpoints
    try {
      // Look for API routes in project files
      const contextResult = await this.executeTool(
        "context_loader",
        {
          projectId,
          includeFiles: true,
          maxDepth: 4,
        },
        { projectId, userId }
      );

      if (contextResult.success) {
        const data = contextResult.data as { files?: Array<string | { path: string }> };
        const files = data?.files || [];

        // Find API route files
        const apiFiles = files.filter((file) => {
          const path = typeof file === 'string' ? file : file.path;
          return (
            path.includes("/api/") ||
            path.includes("/routes/") ||
            path.includes("/endpoints/")
          );
        });

        // Extract endpoint paths from filenames
        for (const file of apiFiles) {
          const path = typeof file === 'string' ? file : file.path;

          // Extract endpoint from file path
          // e.g., src/app/api/users/route.ts -> /api/users
          const match = path.match(/\/api\/([^/]+)/);
          if (match) {
            const endpoint = `/api/${match[1]}`;
            if (!endpoints.includes(`${deploymentUrl}${endpoint}`)) {
              endpoints.push(`${deploymentUrl}${endpoint}`);
            }
          }
        }
      }
    } catch (error) {
      logger.warn(`[${this.name}] Failed to discover endpoints`, { error });
    }

    // Add common health check endpoints
    const healthEndpoints = [
      "/health",
      "/api/health",
      "/status",
      "/api/status",
    ];
    for (const healthEp of healthEndpoints) {
      const url = `${deploymentUrl}${healthEp}`;
      if (!endpoints.includes(url)) {
        endpoints.push(url);
      }
    }

    logger.info(
      `[${this.name}] Discovered ${endpoints.length} endpoints to monitor`
    );
    return endpoints;
  }

  /**
   * Run continuous health checks
   */
  private async runHealthChecks(
    deploymentUrl: string,
    endpoints: string[],
    duration: number,
    interval: number
  ): Promise<HealthCheck[]> {
    logger.info(`[${this.name}] Running health checks`, {
      endpoints: endpoints.length,
      duration: `${duration / 1000}s`,
      interval: `${interval / 1000}s`,
    });

    const healthChecks: HealthCheck[] = [];
    const startTime = Date.now();

    while (Date.now() - startTime < duration) {
      // Check each endpoint
      for (const url of endpoints) {
        const check = await this.performHealthCheck(url);
        healthChecks.push(check);
      }

      // Wait for next interval (unless duration is exceeded)
      const elapsed = Date.now() - startTime;
      if (elapsed < duration) {
        const waitTime = Math.min(interval, duration - elapsed);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    logger.info(
      `[${this.name}] Completed ${healthChecks.length} health checks`
    );
    return healthChecks;
  }

  /**
   * Perform single health check
   */
  private async performHealthCheck(url: string): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "NeuraLaunch-Monitoring-Agent/1.0",
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const responseTime = Date.now() - startTime;

      // Determine health status based on status code and response time
      let status: "healthy" | "degraded" | "down" = "healthy";

      if (!response.ok) {
        status = "down";
      } else if (responseTime > this.RESPONSE_TIME_CRITICAL) {
        status = "degraded";
      }

      return {
        url,
        status,
        responseTime,
        statusCode: response.status,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        url,
        status: "down",
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      };
    }
  }

  /**
   * Collect performance metrics
   */
  private async collectPerformanceMetrics(
    healthChecks: HealthCheck[],
    deploymentUrl: string
  ): Promise<PerformanceMetric[]> {
    logger.info(`[${this.name}] Collecting performance metrics`);

    const metrics: PerformanceMetric[] = [];

    // Calculate average response time
    const responseTimes = healthChecks
      .filter((hc) => hc.status !== "down")
      .map((hc) => hc.responseTime);

    if (responseTimes.length > 0) {
      const avgResponseTime =
        responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length;

      metrics.push({
        metric: "average_response_time",
        value: avgResponseTime,
        unit: "ms",
        threshold: this.RESPONSE_TIME_WARNING,
        status:
          avgResponseTime < this.RESPONSE_TIME_WARNING
            ? "good"
            : avgResponseTime < this.RESPONSE_TIME_CRITICAL
              ? "warning"
              : "critical",
        timestamp: new Date(),
      });

      // P95 response time
      const p95ResponseTime = this.calculatePercentile(responseTimes, 95);
      metrics.push({
        metric: "p95_response_time",
        value: p95ResponseTime,
        unit: "ms",
        threshold: this.RESPONSE_TIME_CRITICAL,
        status:
          p95ResponseTime < this.RESPONSE_TIME_CRITICAL ? "good" : "critical",
        timestamp: new Date(),
      });
    }

    // Calculate error rate
    const totalChecks = healthChecks.length;
    const erroredChecks = healthChecks.filter(
      (hc) => hc.status === "down"
    ).length;
    const errorRate = totalChecks > 0 ? erroredChecks / totalChecks : 0;

    metrics.push({
      metric: "error_rate",
      value: errorRate * 100,
      unit: "%",
      threshold: this.ERROR_RATE_WARNING * 100,
      status:
        errorRate < this.ERROR_RATE_WARNING
          ? "good"
          : errorRate < this.ERROR_RATE_CRITICAL
            ? "warning"
            : "critical",
      timestamp: new Date(),
    });

    // Calculate uptime percentage
    const uptime = this.calculateUptime(healthChecks);
    metrics.push({
      metric: "uptime",
      value: uptime,
      unit: "%",
      threshold: this.MIN_UPTIME * 100,
      status: uptime >= this.MIN_UPTIME * 100 ? "good" : "critical",
      timestamp: new Date(),
    });

    logger.info(
      `[${this.name}] Collected ${metrics.length} performance metrics`
    );
    return metrics;
  }

  /**
   * Analyze error logs
   */
  private async analyzeErrorLogs(
    projectId: string,
    userId: string,
    deploymentUrl: string
  ): Promise<ErrorLog[]> {
    logger.info(`[${this.name}] Analyzing error logs`);

    const errorLogs: ErrorLog[] = [];

    // Try to fetch logs from deployment platform
    // This would require integration with Vercel/Railway/etc. logging APIs

    // For now, we'll analyze based on health checks
    // In a real implementation, you'd integrate with:
    // - Vercel Logs API
    // - Railway Logs
    // - CloudWatch (AWS)
    // - Stackdriver (GCP)
    // - etc.

    // Use AI to analyze patterns if we had logs
    const prompt = `Analyze application logs and identify critical error patterns.

Deployment URL: ${deploymentUrl}

Task: Identify and categorize any errors, their severity, and frequency.

Return JSON array:
[
  {
    "severity": "critical",
    "message": "Database connection timeout",
    "endpoint": "/api/users",
    "count": 5,
    "stackTrace": "..."
  }
]

If no logs are available, return empty array [].
Respond ONLY with valid JSON array, no markdown.`;

    try {
      const response = await this.model.generateContent(prompt);
      const text = response.response.text();

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const log of parsed) {
          errorLogs.push({
            severity: log.severity || "medium",
            message: log.message || "",
            stackTrace: log.stackTrace,
            endpoint: log.endpoint,
            userId: log.userId,
            count: log.count || 1,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      logger.warn(`[${this.name}] Failed to analyze error logs`, { error });
    }

    logger.info(`[${this.name}] Found ${errorLogs.length} error patterns`);
    return errorLogs;
  }

  /**
   * Generate monitoring alerts
   */
  private async generateAlerts(
    healthChecks: HealthCheck[],
    performanceMetrics: PerformanceMetric[],
    errorLogs: ErrorLog[]
  ): Promise<MonitoringAlert[]> {
    logger.info(`[${this.name}] Generating alerts`);

    const alerts: MonitoringAlert[] = [];

    // Alert on critical performance metrics
    for (const metric of performanceMetrics) {
      if (metric.status === "critical") {
        alerts.push({
          severity: "critical",
          title: `Critical: ${metric.metric}`,
          description: `${metric.metric} is at ${metric.value.toFixed(2)}${metric.unit}, exceeding threshold of ${metric.threshold}${metric.unit}`,
          metric: metric.metric,
          currentValue: metric.value,
          threshold: metric.threshold,
          recommendation: this.getMetricRecommendation(metric.metric),
          timestamp: new Date(),
        });
      } else if (metric.status === "warning") {
        alerts.push({
          severity: "warning",
          title: `Warning: ${metric.metric}`,
          description: `${metric.metric} is at ${metric.value.toFixed(2)}${metric.unit}, approaching threshold of ${metric.threshold}${metric.unit}`,
          metric: metric.metric,
          currentValue: metric.value,
          threshold: metric.threshold,
          recommendation: this.getMetricRecommendation(metric.metric),
          timestamp: new Date(),
        });
      }
    }

    // Alert on consecutive failures
    const recentChecks = healthChecks.slice(-10); // Last 10 checks
    const consecutiveFailures = recentChecks.filter(
      (hc) => hc.status === "down"
    ).length;

    if (consecutiveFailures >= 3) {
      alerts.push({
        severity: "critical",
        title: "Application Down",
        description: `Application has failed ${consecutiveFailures} consecutive health checks`,
        recommendation:
          "Check deployment logs immediately. Verify server status and database connectivity.",
        timestamp: new Date(),
      });
    }

    // Alert on critical errors
    const criticalErrors = errorLogs.filter((el) => el.severity === "critical");
    if (criticalErrors.length > 0) {
      alerts.push({
        severity: "critical",
        title: "Critical Errors Detected",
        description: `Found ${criticalErrors.length} critical error(s): ${criticalErrors.map((e) => e.message).join(", ")}`,
        recommendation:
          "Review error logs and fix critical issues immediately.",
        timestamp: new Date(),
      });
    }

    logger.info(`[${this.name}] Generated ${alerts.length} alerts`, {
      critical: alerts.filter((a) => a.severity === "critical").length,
      warning: alerts.filter((a) => a.severity === "warning").length,
    });

    return alerts;
  }

  /**
   * Calculate uptime percentage
   */
  private calculateUptime(healthChecks: HealthCheck[]): number {
    if (healthChecks.length === 0) return 100;

    const successfulChecks = healthChecks.filter(
      (hc) => hc.status !== "down"
    ).length;
    return (successfulChecks / healthChecks.length) * 100;
  }

  /**
   * Determine overall health status
   */
  private determineHealthStatus(
    healthChecks: HealthCheck[],
    performanceMetrics: PerformanceMetric[],
    errorLogs: ErrorLog[],
    uptime: number
  ): "healthy" | "degraded" | "down" {
    // If uptime is below minimum, status is down
    if (uptime < this.MIN_UPTIME * 100) {
      return "down";
    }

    // If any critical metrics, status is degraded
    const hasCriticalMetrics = performanceMetrics.some(
      (m) => m.status === "critical"
    );
    if (hasCriticalMetrics) {
      return "degraded";
    }

    // If critical errors, status is degraded
    const hasCriticalErrors = errorLogs.some(
      (el) => el.severity === "critical"
    );
    if (hasCriticalErrors) {
      return "degraded";
    }

    // Check recent health checks
    const recentChecks = healthChecks.slice(-5); // Last 5 checks
    const recentDownCount = recentChecks.filter(
      (hc) => hc.status === "down"
    ).length;

    if (recentDownCount >= 3) {
      return "down";
    } else if (recentDownCount >= 1) {
      return "degraded";
    }

    return "healthy";
  }

  /**
   * Generate optimization recommendations
   */
  private async generateRecommendations(
    healthChecks: HealthCheck[],
    performanceMetrics: PerformanceMetric[],
    errorLogs: ErrorLog[],
    deploymentUrl: string
  ): Promise<OptimizationRecommendation[]> {
    logger.info(`[${this.name}] Generating recommendations`);

    const recommendations: OptimizationRecommendation[] = [];

    // Analyze performance metrics
    const avgResponseTime = performanceMetrics.find(
      (m) => m.metric === "average_response_time"
    );

    if (avgResponseTime && avgResponseTime.value > this.RESPONSE_TIME_WARNING) {
      recommendations.push({
        category: "performance",
        priority:
          avgResponseTime.value > this.RESPONSE_TIME_CRITICAL
            ? "high"
            : "medium",
        title: "Optimize Response Times",
        description: `Average response time is ${avgResponseTime.value.toFixed(0)}ms, which is ${avgResponseTime.value > this.RESPONSE_TIME_CRITICAL ? "critically" : "significantly"} slow.`,
        impact:
          "Faster response times improve user experience and reduce bounce rates",
        effort: "Medium - Requires performance profiling and optimization",
        implementation:
          "1. Add caching layer (Redis)\n2. Optimize database queries\n3. Enable CDN for static assets\n4. Implement lazy loading\n5. Add database indexes",
      });
    }

    // Error rate recommendations
    const errorRate = performanceMetrics.find((m) => m.metric === "error_rate");
    if (errorRate && errorRate.value > this.ERROR_RATE_WARNING * 100) {
      recommendations.push({
        category: "reliability",
        priority: "high",
        title: "Reduce Error Rate",
        description: `Error rate is ${errorRate.value.toFixed(2)}%, indicating reliability issues.`,
        impact: "Lower error rates improve user trust and system reliability",
        effort: "High - Requires debugging and fixing root causes",
        implementation:
          "1. Review error logs\n2. Add error tracking (Sentry)\n3. Implement retry logic\n4. Add circuit breakers\n5. Improve error handling",
      });
    }

    // Uptime recommendations
    const uptime = performanceMetrics.find((m) => m.metric === "uptime");
    if (uptime && uptime.value < this.MIN_UPTIME * 100) {
      recommendations.push({
        category: "reliability",
        priority: "high",
        title: "Improve Uptime",
        description: `Uptime is ${uptime.value.toFixed(2)}%, below the ${this.MIN_UPTIME * 100}% SLA.`,
        impact:
          "Higher uptime ensures service availability and user satisfaction",
        effort: "Medium - Requires infrastructure improvements",
        implementation:
          "1. Add health check endpoints\n2. Implement auto-scaling\n3. Set up load balancing\n4. Add redundancy\n5. Configure automatic restarts",
      });
    }

    // Use AI to generate additional recommendations
    const prompt = `Based on monitoring data, provide optimization recommendations.

Performance Metrics:
${JSON.stringify(performanceMetrics, null, 2)}

Error Logs:
${JSON.stringify(errorLogs.slice(0, 5), null, 2)}

Generate recommendations for:
- Performance optimization
- Cost reduction
- Security hardening
- Monitoring improvements

Return JSON array:
[
  {
    "category": "performance",
    "priority": "high",
    "title": "Add Database Indexes",
    "description": "Slow query performance detected",
    "impact": "50% faster query times",
    "effort": "Low - 1-2 hours",
    "implementation": "ALTER TABLE users ADD INDEX idx_email (email);"
  }
]

Respond ONLY with valid JSON array, no markdown.`;

    try {
      const response = await this.model.generateContent(prompt);
      const text = response.response.text();

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        recommendations.push(...parsed);
      }
    } catch (error) {
      logger.warn(`[${this.name}] Failed to generate AI recommendations`, {
        error,
      });
    }

    logger.info(
      `[${this.name}] Generated ${recommendations.length} recommendations`
    );
    return recommendations;
  }

  /**
   * Generate monitoring summary
   */
  private async generateSummary(
    healthStatus: string,
    uptime: number,
    healthChecks: HealthCheck[],
    performanceMetrics: PerformanceMetric[],
    errorLogs: ErrorLog[],
    alerts: MonitoringAlert[]
  ): Promise<string> {
    logger.info(`[${this.name}] Generating summary`);

    const prompt = `Generate a concise monitoring summary for a production application.

Health Status: ${healthStatus}
Uptime: ${uptime.toFixed(2)}%
Total Health Checks: ${healthChecks.length}
Failed Checks: ${healthChecks.filter((hc) => hc.status === "down").length}

Performance Metrics:
${JSON.stringify(performanceMetrics, null, 2)}

Error Logs:
${JSON.stringify(errorLogs.slice(0, 5), null, 2)}

Alerts:
${JSON.stringify(alerts, null, 2)}

Generate a brief summary (2-3 paragraphs) covering:
1. Overall system health
2. Key performance indicators
3. Critical issues (if any)
4. Recommended actions

Write in professional, concise style. No markdown formatting.`;

    try {
      const response = await this.model.generateContent(prompt);
      return response.response.text().trim();
    } catch (error) {
      logger.warn(`[${this.name}] Failed to generate summary`, { error });

      // Fallback summary
      return `System Status: ${healthStatus.toUpperCase()}. Monitored ${healthChecks.length} health checks with ${uptime.toFixed(2)}% uptime. ${alerts.length > 0 ? `${alerts.length} alert(s) detected requiring attention.` : "No critical issues detected."}`;
    }
  }

  /**
   * Store monitoring report in database
   */
  private async storeMonitoringReport(
    taskId: string,
    projectId: string,
    report: MonitoringReport
  ): Promise<void> {
    try {
      await prisma.agentTask.update({
        where: { id: taskId },
        data: {
          output: report as any,
          status: "completed",
          completedAt: new Date(),
        },
      });

      logger.info(`[${this.name}] Stored monitoring report`, { taskId });
    } catch (error) {
      logger.error(`[${this.name}] Failed to store report`, 
        error instanceof Error ? error : new Error(String(error)),
        { taskId }
      );
    }
  }

  /**
   * Send critical alerts
   */
  private async sendCriticalAlerts(
    projectId: string,
    userId: string,
    alerts: MonitoringAlert[]
  ): Promise<void> {
    const criticalAlerts = alerts.filter((a) => a.severity === "critical");

    if (criticalAlerts.length === 0) return;

    logger.warn(
      `[${this.name}] Sending ${criticalAlerts.length} critical alerts`,
      {
        projectId,
        userId,
      }
    );

    // TODO: Implement alert delivery
    // Options:
    // 1. Email notification
    // 2. Slack webhook
    // 3. Discord webhook
    // 4. SMS (Twilio)
    // 5. PagerDuty
    // 6. In-app notification

    // For now, just log
    for (const alert of criticalAlerts) {
      logger.error(`[CRITICAL ALERT] ${alert.title}: ${alert.description}`, 
        undefined,
        { recommendation: alert.recommendation }
      );
    }
  }

  /**
   * Get recommendation for a metric
   */
  private getMetricRecommendation(metricName: string): string {
    const recommendations: Record<string, string> = {
      average_response_time:
        "Optimize database queries, add caching, enable CDN, reduce payload size",
      p95_response_time:
        "Profile slow endpoints, add database indexes, implement connection pooling",
      error_rate:
        "Review error logs, add retry logic, improve error handling, fix bugs",
      uptime:
        "Add health monitoring, implement auto-recovery, set up redundancy, use load balancing",
    };

    return (
      recommendations[metricName] || "Review logs and system configuration"
    );
  }

  /**
   * Calculate percentile value
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const monitoringAgent = new MonitoringAgent();
