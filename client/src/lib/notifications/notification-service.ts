// src/lib/notifications/notification-service.ts
/**
 * Notification Service
 * Handles email and webhook notifications for review requests
 */

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { toError } from "@/lib/error-utils";

export interface ReviewNotification {
  userId: string;
  reviewId: string;
  projectId: string;
  waveNumber: number;
  priority: "critical" | "high" | "medium";
  reason: string;
}

/**
 * Send review notification (email + webhook if configured)
 */
export async function sendReviewNotification(
  notification: ReviewNotification
): Promise<void> {
  const { userId, reviewId, projectId, waveNumber, priority, reason } =
    notification;

  logger.info("Sending review notification", {
    userId,
    reviewId,
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

    // Send email notification
    await sendEmailNotification({
      to: user.email,
      userName: user.name || "there",
      reviewId,
      projectId,
      waveNumber,
      priority,
      reason,
    });

    // Send webhook notification (if configured)
    await sendWebhookNotification({
      userId,
      reviewId,
      projectId,
      waveNumber,
      priority,
      reason,
    });

    logger.info("Review notification sent successfully", {
      userId,
      reviewId,
      email: user.email,
    });
  } catch (error) {
    logger.error("Failed to send review notification", toError(error));
    throw error;
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(params: {
  to: string;
  userName: string;
  reviewId: string;
  projectId: string;
  waveNumber: number;
  priority: string;
  reason: string;
}): Promise<void> {
  const { to, userName, reviewId, projectId, waveNumber, priority, reason } =
    params;

  // Check if email service is configured
  const emailProvider = process.env.EMAIL_PROVIDER; // 'resend' | 'sendgrid' | 'ses'

  if (!emailProvider) {
    logger.warn("EMAIL_PROVIDER not configured, skipping email notification");
    return;
  }

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
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/reviews/${reviewId}" class="button">
          Review Now →
        </a>
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated notification from NeuraLaunch</p>
      <p>Need help? <a href="${process.env.NEXT_PUBLIC_APP_URL}/support">Contact Support</a></p>
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

Review Now: ${process.env.NEXT_PUBLIC_APP_URL}/projects/${projectId}/reviews/${reviewId}

---
This is an automated notification from NeuraLaunch
  `;

  // Send email based on provider
  switch (emailProvider) {
    case "resend":
      await sendWithResend({ to, subject, html: htmlBody, text: textBody });
      break;
    case "sendgrid":
      await sendWithSendGrid({ to, subject, html: htmlBody, text: textBody });
      break;
    case "ses":
      await sendWithSES({ to, subject, html: htmlBody, text: textBody });
      break;
    default:
      logger.warn(`Unknown email provider: ${emailProvider}`);
  }
}

/**
 * Send with Resend
 */
async function sendWithResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "NeuraLaunch <noreply@neuralaunch.com>",
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    logger.info("Email sent via Resend", { to: params.to });
  } catch (error) {
    logger.error("Resend email failed", toError(error));
    throw error;
  }
}

/**
 * Send with SendGrid (optional dependency)
 */
async function sendWithSendGrid(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  try {
    const sgMail = await import("@sendgrid/mail");
    sgMail.default.setApiKey(process.env.SENDGRID_API_KEY!);

    await sgMail.default.send({
      from: process.env.EMAIL_FROM || "noreply@neuralaunch.com",
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    logger.info("Email sent via SendGrid", { to: params.to });
  } catch (error) {
    if ((error as any)?.code === 'MODULE_NOT_FOUND') {
      logger.warn("SendGrid not installed, skipping email", { to: params.to });
      return;
    }
    logger.error("SendGrid email failed", toError(error));
    throw error;
  }
}

/**
 * Send with AWS SES (optional dependency)
 */
async function sendWithSES(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  try {
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");

    const sesClient = new SESClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const command = new SendEmailCommand({
      Source: process.env.EMAIL_FROM || "noreply@neuralaunch.com",
      Destination: {
        ToAddresses: [params.to],
      },
      Message: {
        Subject: {
          Data: params.subject,
        },
        Body: {
          Html: {
            Data: params.html,
          },
          Text: {
            Data: params.text,
          },
        },
      },
    });

    await sesClient.send(command);

    logger.info("Email sent via AWS SES", { to: params.to });
  } catch (error) {
    if ((error as any)?.code === 'MODULE_NOT_FOUND') {
      logger.warn("AWS SES SDK not installed, skipping email", { to: params.to });
      return;
    }
    logger.error("AWS SES email failed", toError(error));
    throw error;
  }
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(params: {
  userId: string;
  reviewId: string;
  projectId: string;
  waveNumber: number;
  priority: string;
  reason: string;
}): Promise<void> {
  const webhookUrl = process.env.REVIEW_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.info("REVIEW_WEBHOOK_URL not configured, skipping webhook");
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NeuraLaunch-Event": "review.created",
      },
      body: JSON.stringify({
        event: "review.created",
        timestamp: new Date().toISOString(),
        data: {
          reviewId: params.reviewId,
          projectId: params.projectId,
          userId: params.userId,
          waveNumber: params.waveNumber,
          priority: params.priority,
          reason: params.reason,
          reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL}/projects/${params.projectId}/reviews/${params.reviewId}`,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook failed: ${response.status} ${response.statusText}`
      );
    }

    logger.info("Webhook notification sent", {
      reviewId: params.reviewId,
      webhookUrl,
    });
  } catch (error) {
    logger.error("Webhook notification failed", toError(error));
    // Don't throw - webhook failure shouldn't break the flow
  }
}
