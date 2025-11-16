// src/lib/notifications/notification-service.ts
/**
 * Notification Service
 * Handles email and webhook notifications for all system events
 */

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { toError } from "@/lib/error-utils";
import { env } from "@/lib/env";
import { Resend } from "resend";
import {
  buildSuccessEmail,
  buildErrorEmail,
  buildAlertEmail,
  buildGenericEmail,
} from "./email-templates";

// Initialize Resend client
const resend = new Resend(env.RESEND_API_KEY);

// Resend-specific configuration
const RESEND_CONFIG = {
  from: {
    notifications: `NeuraLaunch <notifications@${env.RESEND_DOMAIN}>`,
    alerts: `NeuraLaunch Alerts <alerts@${env.RESEND_DOMAIN}>`,
  },
  replyTo: env.RESEND_REPLY_TO,
} as const;

export type NotificationType =
  | "review_required"
  | "analysis_complete"
  | "planning_complete"
  | "execution_complete"
  | "deployment_complete"
  | "error_occurred"
  | "optimization_complete"
  | "monitoring_alert"
  | "escalation";

export type NotificationPriority = "critical" | "high" | "medium" | "low";

export interface BaseNotification {
  userId: string;
  projectId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewNotification extends BaseNotification {
  type: "review_required";
  reviewId: string;
  waveNumber: number;
  reason: string;
}

export interface AnalysisCompleteNotification extends BaseNotification {
  type: "analysis_complete";
  analysisResult: {
    summary: string;
    nextSteps: string[];
  };
}

export interface PlanningCompleteNotification extends BaseNotification {
  type: "planning_complete";
  planSummary: string;
  totalWaves: number;
}

export interface ExecutionCompleteNotification extends BaseNotification {
  type: "execution_complete";
  completedWaves: number;
  totalWaves: number;
  successRate: number;
}

export interface DeploymentCompleteNotification extends BaseNotification {
  type: "deployment_complete";
  environment: string;
  deploymentUrl?: string;
  success: boolean;
}

export interface ErrorNotification extends BaseNotification {
  type: "error_occurred";
  error: string;
  phase: string;
  canRetry: boolean;
}

export interface OptimizationCompleteNotification extends BaseNotification {
  type: "optimization_complete";
  optimizationsApplied: number;
  performanceGain?: string;
}

export interface MonitoringAlertNotification extends BaseNotification {
  type: "monitoring_alert";
  alertType: string;
  severity: "warning" | "error" | "critical";
  metrics?: Record<string, unknown>;
}

export interface EscalationNotification extends BaseNotification {
  type: "escalation";
  escalationReason: string;
  attempts: number;
}

export type Notification =
  | ReviewNotification
  | AnalysisCompleteNotification
  | PlanningCompleteNotification
  | ExecutionCompleteNotification
  | DeploymentCompleteNotification
  | ErrorNotification
  | OptimizationCompleteNotification
  | MonitoringAlertNotification
  | EscalationNotification;

/**
 * Main notification sender - handles all notification types
 */
export async function sendNotification(notification: Notification): Promise<void> {
  const { userId, projectId, type, priority } = notification;

  logger.info("Sending notification", {
    userId,
    projectId,
    type,
    priority,
  });

  try {
    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
      },
    });

    if (!user?.email) {
      logger.warn("User email not found, skipping notification", { userId });
      return;
    }

    // Build email content based on notification type
    const emailContent = buildEmailContent(notification, user.name || "there");

    // Send email notification with Resend tags
    await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      priority,
      type,
      projectId,
    });

    // Send webhook notification (if configured)
    await sendWebhook({
      userId,
      projectId,
      type,
      priority,
      data: notification,
    });

    logger.info("Notification sent successfully", {
      userId,
      type,
      email: user.email,
    });
  } catch (error) {
    logger.error("Failed to send notification", toError(error));
    // Don't throw - notification failures shouldn't break the main flow
  }
}

/**
 * Legacy function for review notifications (backward compatibility)
 * @deprecated Use sendNotification() instead
 */
export async function sendReviewNotification(
  params: Omit<ReviewNotification, "type" | "title" | "message">
): Promise<void> {
  await sendNotification({
    ...params,
    type: "review_required",
    title: `Wave ${params.waveNumber} Needs Review`,
    message: params.reason,
    priority: params.priority,
  });
}

/**
 * Build email content based on notification type
 */
function buildEmailContent(
  notification: Notification,
  userName: string
): { subject: string; html: string; text: string } {
  const { type, projectId } = notification;

  switch (type) {
    case "review_required": {
      const n = notification;
      return buildReviewEmail(userName, n);
    }

    case "analysis_complete": {
      const n = notification;
      return {
        subject: "✅ Project Analysis Complete - NeuraLaunch",
        html: buildSuccessEmail(
          userName,
          "Analysis Complete",
          `Your project analysis is complete! We've analyzed your requirements and are ready to create a detailed plan.`,
          [
            `<strong>Summary:</strong> ${n.analysisResult.summary}`,
            `<strong>Next Steps:</strong> ${n.analysisResult.nextSteps.join(", ")}`,
          ],
          `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/plan`
        ),
        text: `Hi ${userName},\n\nYour project analysis is complete!\n\nSummary: ${n.analysisResult.summary}\n\nView Plan: ${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/plan`,
      };
    }

    case "planning_complete": {
      const n = notification;
      return {
        subject: "📋 Project Plan Ready - NeuraLaunch",
        html: buildSuccessEmail(
          userName,
          "Planning Complete",
          `Your project plan is ready for review! We've created ${n.totalWaves} execution waves.`,
          [
            `<strong>Plan Summary:</strong> ${n.planSummary}`,
            `<strong>Total Waves:</strong> ${n.totalWaves}`,
          ],
          `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/plan`
        ),
        text: `Hi ${userName},\n\nYour project plan is ready!\n\n${n.planSummary}\n\nTotal Waves: ${n.totalWaves}\n\nView Plan: ${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/plan`,
      };
    }

    case "execution_complete": {
      const n = notification;
      return {
        subject: "🎉 Project Execution Complete - NeuraLaunch",
        html: buildSuccessEmail(
          userName,
          "Execution Complete",
          `Your project execution is complete! ${n.completedWaves}/${n.totalWaves} waves completed successfully.`,
          [
            `<strong>Completed Waves:</strong> ${n.completedWaves}/${n.totalWaves}`,
            `<strong>Success Rate:</strong> ${n.successRate}%`,
          ],
          `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/execution`
        ),
        text: `Hi ${userName},\n\nYour project execution is complete!\n\nCompleted: ${n.completedWaves}/${n.totalWaves} waves\nSuccess Rate: ${n.successRate}%\n\nView Project: ${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/execution`,
      };
    }

    case "deployment_complete": {
      const n = notification;
      return {
        subject: n.success
          ? `🚀 Deployment Successful (${n.environment}) - NeuraLaunch`
          : `❌ Deployment Failed (${n.environment}) - NeuraLaunch`,
        html: n.success
          ? buildSuccessEmail(
              userName,
              "Deployment Successful",
              `Your project has been deployed to ${n.environment}!`,
              [
                `<strong>Environment:</strong> ${n.environment}`,
                n.deploymentUrl
                  ? `<strong>URL:</strong> <a href="${n.deploymentUrl}">${n.deploymentUrl}</a>`
                  : "",
              ],
              n.deploymentUrl || `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}`
            )
          : buildErrorEmail(
              userName,
              "Deployment Failed",
              `Deployment to ${n.environment} failed. Please review the logs.`,
              [
                `<strong>Environment:</strong> ${n.environment}`,
              ],
              `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/deployments`
            ),
        text: n.success
          ? `Hi ${userName},\n\nYour project has been deployed to ${n.environment}!\n\nURL: ${n.deploymentUrl || "N/A"}`
          : `Hi ${userName},\n\nDeployment to ${n.environment} failed. Please check the logs.`,
      };
    }

    case "error_occurred": {
      const n = notification;
      return {
        subject: `❌ Error in ${n.phase} - NeuraLaunch`,
        html: buildErrorEmail(
          userName,
          `Error in ${n.phase}`,
          n.error,
          [
            `<strong>Phase:</strong> ${n.phase}`,
            `<strong>Can Retry:</strong> ${n.canRetry ? "Yes" : "No"}`,
          ],
          `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}`
        ),
        text: `Hi ${userName},\n\nAn error occurred in ${n.phase}:\n\n${n.error}\n\nCan Retry: ${n.canRetry ? "Yes" : "No"}`,
      };
    }

    case "optimization_complete": {
      const n = notification;
      return {
        subject: "⚡ Optimization Complete - NeuraLaunch",
        html: buildSuccessEmail(
          userName,
          "Optimization Complete",
          `${n.optimizationsApplied} optimizations have been applied to your project.`,
          [
            `<strong>Optimizations Applied:</strong> ${n.optimizationsApplied}`,
            n.performanceGain
              ? `<strong>Performance Gain:</strong> ${n.performanceGain}`
              : "",
          ],
          `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}`
        ),
        text: `Hi ${userName},\n\nOptimization complete!\n\nOptimizations Applied: ${n.optimizationsApplied}${n.performanceGain ? `\nPerformance Gain: ${n.performanceGain}` : ""}`,
      };
    }

    case "monitoring_alert": {
      const n = notification;
      return {
        subject: `🚨 ${n.severity.toUpperCase()} Alert: ${n.alertType} - NeuraLaunch`,
        html: buildAlertEmail(
          userName,
          n.alertType,
          n.severity,
          n.message,
          (n.metrics || {}) as Record<string, string | number>,
          `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/monitoring`
        ),
        text: `Hi ${userName},\n\n[${n.severity.toUpperCase()}] ${n.alertType}\n\n${n.message}`,
      };
    }

    case "escalation": {
      const n = notification;
      return {
        subject: `🔔 Issue Escalated - NeuraLaunch`,
        html: buildErrorEmail(
          userName,
          "Issue Escalated",
          n.escalationReason,
          [
            `<strong>Attempts:</strong> ${n.attempts}`,
            `<strong>Action Required:</strong> Manual intervention needed`,
          ],
          `${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}`
        ),
        text: `Hi ${userName},\n\nAn issue has been escalated after ${n.attempts} attempts:\n\n${n.escalationReason}\n\nManual intervention required.`,
      };
    }

    default: {
      const n = notification as BaseNotification;
      return {
        subject: "Notification - NeuraLaunch",
        html: buildGenericEmail(userName, n.title, n.message),
        text: `Hi ${userName},\n\n${n.title}\n\n${n.message}`,
      };
    }
  }
}

/**
 * Build review email (special handling)
 */
function buildReviewEmail(
  userName: string,
  notification: ReviewNotification
): { subject: string; html: string; text: string } {
  const { reviewId, projectId, waveNumber, priority, reason } = notification;

  const subject = `[${priority.toUpperCase()}] Wave ${waveNumber} Needs Your Review - NeuraLaunch`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Review Required</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .priority-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    .priority-critical {
      background-color: #fee;
      color: #c33;
    }
    .priority-high {
      background-color: #fef3cd;
      color: #856404;
    }
    .priority-medium {
      background-color: #d1ecf1;
      color: #0c5460;
    }
    .content {
      margin: 20px 0;
    }
    .info-box {
      background: #f8f9fa;
      border-left: 4px solid #007bff;
      padding: 15px;
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #007bff;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin-top: 20px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e9ecef;
      font-size: 12px;
      color: #6c757d;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 Human Review Required</h1>
    </div>
    
    <div class="content">
      <p>Hi ${userName},</p>
      
      <span class="priority-badge priority-${priority}">${priority} Priority</span>
      
      <p>Your NeuraLaunch project needs your attention. The automated system encountered issues that require human review.</p>
      
      <div class="info-box">
        <strong>📋 Details:</strong><br>
        <strong>Wave:</strong> ${waveNumber}<br>
        <strong>Reason:</strong> ${reason}<br>
        <strong>Project ID:</strong> ${projectId}
      </div>
      
      <p><strong>What happened?</strong></p>
      <p>The system attempted to automatically fix the issues but was unsuccessful after multiple attempts. Your expertise is needed to review and resolve the situation.</p>
      
      <p><strong>What you can do:</strong></p>
      <ul>
        <li><strong>Approve:</strong> If the current state is acceptable, approve and continue</li>
        <li><strong>Request Changes:</strong> Provide guidance and retry</li>
        <li><strong>Retry Auto-Fix:</strong> Give the system another chance with extended attempts</li>
        <li><strong>Reject:</strong> Stop this wave and revise the plan</li>
      </ul>
      
      <div style="text-align: center;">
        <a href="${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/reviews/${reviewId}" class="button">
          Review Now →
        </a>
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated notification from NeuraLaunch</p>
      <p>Need help? <a href="${env.NEXT_PUBLIC_APP_URL}/support">Contact Support</a></p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
Hi ${userName},

Your NeuraLaunch project needs your attention.

[${priority.toUpperCase()} Priority]

Wave ${waveNumber} encountered issues that require human review.

Reason: ${reason}
Project ID: ${projectId}

Review Now: ${env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/reviews/${reviewId}

---
This is an automated notification from NeuraLaunch
  `;

  return {
    subject,
    html: htmlBody,
    text: textBody,
  };
}

/**
 * Send with Resend
 */
/**
 * Send email using Resend with tags and tracking
 */
async function sendWithResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  priority?: "critical" | "high" | "medium" | "low";
  type?: NotificationType;
  projectId?: string;
}): Promise<void> {
  try {
    const { data, error } = await resend.emails.send({
      from: RESEND_CONFIG.from.notifications,
      to: params.to,
      replyTo: RESEND_CONFIG.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
      tags: [
        ...(params.type ? [{ name: "type", value: params.type }] : []),
        ...(params.priority ? [{ name: "priority", value: params.priority }] : []),
        { name: "category", value: "notification" },
      ],
      headers: {
        "X-Priority":
          params.priority === "critical"
            ? "1"
            : params.priority === "high"
              ? "2"
              : "3",
        "X-Entity-Ref-ID": `notif-${params.projectId || "system"}-${Date.now()}`,
      },
    });

    if (error) {
      logger.error("Resend API error", error as Error, { to: params.to });
      throw new Error(
        typeof error === "string"
          ? error
          : typeof error === "object"
            ? JSON.stringify(error)
            : String(error)
      );
    }

    logger.info("Email sent via Resend", {
      to: params.to,
      emailId: data?.id,
      type: params.type,
    });
  } catch (error) {
    logger.error("Resend email failed", toError(error));
    throw error;
  }
}




/**
 * Send email using Resend
 * Simplified to use Resend only (no provider switching)
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  priority?: "critical" | "high" | "medium" | "low";
  type?: NotificationType;
  projectId?: string;
}): Promise<void> {
  await sendWithResend(params);
}

/**
 * Unified webhook sender
 */
async function sendWebhook(params: {
  userId: string;
  projectId: string;
  type: NotificationType;
  priority: NotificationPriority;
  data: Notification;
}): Promise<void> {
  const webhookUrl = env.REVIEW_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.info("REVIEW_WEBHOOK_URL not configured, skipping webhook");
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NeuraLaunch-Event": `notification.${params.type}`,
      },
      body: JSON.stringify({
        event: `notification.${params.type}`,
        timestamp: new Date().toISOString(),
        data: {
          userId: params.userId,
          projectId: params.projectId,
          type: params.type,
          priority: params.priority,
          notification: params.data,
          actionUrl: `${env.NEXT_PUBLIC_APP_URL}/projects/${params.projectId}`,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook failed: ${response.status} ${response.statusText}`
      );
    }

    logger.info("Webhook notification sent", {
      type: params.type,
      webhookUrl,
    });
  } catch (error) {
    logger.error("Webhook notification failed", toError(error));
    // Don't throw - webhook failure shouldn't break the flow
  }
}
