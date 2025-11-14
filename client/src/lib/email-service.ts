// lib/email-service.ts
// PRODUCTION-READY email service using Resend
// Optimized specifically for Resend API with all features enabled

import { Resend } from "resend";
import { env } from "@/lib/env";
import { createApiLogger } from "@/lib/logger";

const logger = createApiLogger({ path: "/lib/email-service" });

// Initialize Resend with API key
const resend = new Resend(env.RESEND_API_KEY);

// Resend-specific email configuration
const EMAIL_CONFIG = {
  domain: env.RESEND_DOMAIN,
  from: {
    welcome: `NeuraLaunch <welcome@${env.RESEND_DOMAIN}>`,
    notifications: `NeuraLaunch <notifications@${env.RESEND_DOMAIN}>`,
    reminders: `NeuraLaunch <reminders@${env.RESEND_DOMAIN}>`,
    noreply: `NeuraLaunch <noreply@${env.RESEND_DOMAIN}>`,
  },
  replyTo: env.RESEND_REPLY_TO,
  tags: {
    welcome: "welcome-email",
    founderNotification: "founder-notification",
    sprintReminder: "sprint-reminder",
    reviewNotification: "review-notification",
  },
} as const;

interface WelcomeEmailParams {
  to: string;
  name?: string;
  startupName: string;
  landingPageUrl: string;
}

interface SprintReminderParams {
  to: string;
  userName?: string | null;
  startupName: string;
  sprintUrl: string;
}

interface ResendEmailResponse {
  id: string;
}

interface ResendError {
  message: string;
  name: string;
}

/**
 * Send welcome email to new signup using Resend
 * Uses Resend-specific features: tags, reply-to, tracking
 */
export async function sendWelcomeEmail({
  to,
  name,
  startupName,
  landingPageUrl,
}: WelcomeEmailParams): Promise<boolean> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from.welcome,
      to: [to],
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Thanks for joining ${startupName}! 🚀`,
      html: generateWelcomeEmailHTML({ name, startupName, landingPageUrl }),
      text: generateWelcomeEmailText({ name, startupName, landingPageUrl }),
      tags: [
        {
          name: "category",
          value: EMAIL_CONFIG.tags.welcome,
        },
        {
          name: "startup",
          value: startupName.toLowerCase().replace(/\s+/g, "-"),
        },
      ],
      headers: {
        "X-Entity-Ref-ID": `signup-${Date.now()}`,
      },
    });

    if (error) {
      logger.error("Failed to send welcome email", error as Error, {
        to,
        startupName,
      });
      return false;
    }

    logger.info("Welcome email sent successfully", {
      emailId: (data as ResendEmailResponse)?.id,
      to,
      startupName,
    });
    return true;
  } catch (error) {
    logger.error("Email service error", error as Error, { to });
    return false;
  }
}

// HTML version of welcome email (No changes needed here)
function generateWelcomeEmailHTML({
  name,
  startupName,
  landingPageUrl,
}: Omit<WelcomeEmailParams, "to">): string {
  const greeting = name ? `Hi ${name}` : "Hi there";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${startupName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 30px 0;
      border-bottom: 2px solid #f0f0f0;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #6366f1;
    }
    .content {
      padding: 30px 0;
    }
    .cta-button {
      display: inline-block;
      background: #6366f1;
      color: white;
      padding: 14px 28px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      padding: 30px 0;
      border-top: 2px solid #f0f0f0;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🚀 ${startupName}</div>
  </div>
  
  <div class="content">
    <h1>${greeting}! 👋</h1>
    
    <p>Thanks for joining the waitlist for <strong>${startupName}</strong>!</p>
    
    <p>We're excited to have you on board. We're working hard to bring you something amazing, and we'll keep you updated every step of the way.</p>
    
    <p><strong>What happens next?</strong></p>
    <ul>
      <li>We'll email you with exclusive early access when we launch</li>
      <li>You'll be among the first to try out the new features</li>
      <li>We'll share behind-the-scenes updates on our progress</li>
    </ul>
    
    <center>
      <a href="${landingPageUrl}" class="cta-button">
        Visit Our Page
      </a>
    </center>
    
    <p>Have questions? Just reply to this email - we read every message!</p>
    
    <p>Thanks again,<br>
    The ${startupName} Team</p>
  </div>
  
  <div class="footer">
    <p>This email was sent because you signed up at <a href="${landingPageUrl}">${landingPageUrl}</a></p>
    <p>Powered by <a href="https://startupvalidator.app">NeuraLaunch</a></p>
  </div>
</body>
</html>
  `;
}

// Plain text version (No changes needed here)
function generateWelcomeEmailText({
  name,
  startupName,
  landingPageUrl,
}: Omit<WelcomeEmailParams, "to">): string {
  const greeting = name ? `Hi ${name}` : "Hi there";

  return `
${greeting}!

Thanks for joining the waitlist for ${startupName}!

We're excited to have you on board. We're working hard to bring you something amazing, and we'll keep you updated every step of the way.

What happens next?
• We'll email you with exclusive early access when we launch
• You'll be among the first to try out the new features
• We'll share behind-the-scenes updates on our progress

Visit our page: ${landingPageUrl}

Have questions? Just reply to this email - we read every message!

Thanks again,
The ${startupName} Team

---
This email was sent because you signed up at ${landingPageUrl}
Powered by NeuraLaunch - https://startupvalidator.app
  `;
}

/**
 * Notify founder of new signup using Resend
 * Uses Resend-specific features: tags, priority headers
 */
export async function notifyFounderOfSignup({
  founderEmail,
  signupEmail,
  signupName,
  startupName,
}: {
  founderEmail: string;
  signupEmail: string;
  signupName?: string;
  startupName: string;
}): Promise<boolean> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from.notifications,
      to: [founderEmail],
      replyTo: signupEmail, // Allow founder to reply directly to the signup
      subject: `🎉 New signup for ${startupName}!`,
      html: `
        <h2>Great news!</h2>
        <p>Someone just signed up for ${startupName}:</p>
        <ul>
          <li><strong>Email:</strong> ${signupEmail}</li>
          ${signupName ? `<li><strong>Name:</strong> ${signupName}</li>` : ""}
          <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>Keep up the momentum! 🚀</p>
        <hr />
        <p style="font-size: 12px; color: #666;">
          Powered by <a href="https://neuralaunch.app">NeuraLaunch</a>
        </p>
      `,
      tags: [
        {
          name: "category",
          value: EMAIL_CONFIG.tags.founderNotification,
        },
        {
          name: "startup",
          value: startupName.toLowerCase().replace(/\s+/g, "-"),
        },
      ],
      headers: {
        "X-Priority": "1", // High priority
        "X-Entity-Ref-ID": `founder-notif-${Date.now()}`,
      },
    });

    if (error) {
      logger.error("Failed to notify founder", error as Error, {
        founderEmail,
        signupEmail,
      });
      return false;
    }

    logger.info("Founder notification sent successfully", {
      emailId: (data as ResendEmailResponse)?.id,
      founderEmail,
    });
    return true;
  } catch (error) {
    logger.error("Founder notification error", error as Error, {
      founderEmail,
    });
    return false;
  }
}

/**
 * Send sprint reminder email using Resend
 * Uses Resend-specific features: scheduled sending, tags, tracking
 */
export async function sendSprintReminderEmail(
  params: SprintReminderParams
): Promise<boolean> {
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from.reminders,
      to: [params.to],
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Keep up the momentum on ${params.startupName}! 🚀`,
      html: generateReminderEmailHTML(params),
      tags: [
        {
          name: "category",
          value: EMAIL_CONFIG.tags.sprintReminder,
        },
        {
          name: "startup",
          value: params.startupName.toLowerCase().replace(/\s+/g, "-"),
        },
      ],
      headers: {
        "X-Entity-Ref-ID": `sprint-reminder-${Date.now()}`,
      },
    });

    if (error) {
      logger.error("Failed to send sprint reminder email", error as Error, {
        to: params.to,
        startupName: params.startupName,
      });
      return false;
    }

    logger.info("Sprint reminder email sent successfully", {
      emailId: (data as ResendEmailResponse)?.id,
      to: params.to,
    });
    return true;
  } catch (error) {
    logger.error("Sprint reminder email service error", error as Error, {
      to: params.to,
    });
    return false;
  }
}

/**
 * Send review notification email using Resend
 * Notifies user when their project needs human review
 */
export async function sendReviewNotificationEmail({
  to,
  userName,
  projectName,
  reviewUrl,
  reason,
  priority,
}: {
  to: string;
  userName?: string;
  projectName: string;
  reviewUrl: string;
  reason: string;
  priority: "critical" | "high" | "medium";
}): Promise<boolean> {
  try {
    const priorityEmoji = {
      critical: "🚨",
      high: "⚠️",
      medium: "📋",
    };

    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from.notifications,
      to: [to],
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `${priorityEmoji[priority]} Review Required: ${projectName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #eee; }
            .priority-${priority} { background: ${priority === "critical" ? "#fee" : priority === "high" ? "#fef3cd" : "#e7f3ff"}; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .cta-button { display: inline-block; background: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>NeuraLaunch Review System</h1>
          </div>
          <h2>Hi ${userName || "there"}! 👋</h2>
          <div class="priority-${priority}">
            <strong>${priorityEmoji[priority]} ${priority.toUpperCase()} Priority</strong>
            <p>Your project <strong>${projectName}</strong> needs your attention.</p>
          </div>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>Please review the issues and provide guidance to continue execution.</p>
          <center>
            <a href="${reviewUrl}" class="cta-button">
              Review Now
            </a>
          </center>
          <p>Best,<br>The NeuraLaunch Team</p>
        </body>
        </html>
      `,
      tags: [
        {
          name: "category",
          value: EMAIL_CONFIG.tags.reviewNotification,
        },
        {
          name: "priority",
          value: priority,
        },
      ],
      headers: {
        "X-Priority": priority === "critical" ? "1" : priority === "high" ? "2" : "3",
        "X-Entity-Ref-ID": `review-notif-${Date.now()}`,
      },
    });

    if (error) {
      logger.error("Failed to send review notification email", error as Error, {
        to,
        projectName,
      });
      return false;
    }

    logger.info("Review notification email sent successfully", {
      emailId: (data as ResendEmailResponse)?.id,
      to,
      priority,
    });
    return true;
  } catch (error) {
    logger.error("Review notification email service error", error as Error, {
      to,
    });
    return false;
  }
}

// generateReminderEmailHTML function (No changes needed here)
function generateReminderEmailHTML({
  userName,
  startupName,
  sprintUrl,
}: SprintReminderParams): string {
  const greeting = userName ? `Hi ${userName}` : "Hi there";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Keep up the Momentum!</title>
      <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .content { padding: 30px 0; }
        .cta-button { display: inline-block; background: #7C3AED; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .footer { text-align: center; font-size: 12px; color: #999; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>NeuraLaunch Sprint</h1>
      </div>
      <div class="content">
        <h2>${greeting}! 👋</h2>
        <p>Just a friendly reminder to keep up the great momentum on your startup idea, <strong>${startupName}</strong>.</p>
        <p>Your 72-hour validation sprint is your chance to turn this idea into a reality. The next small step you take could be the one that leads to your first user.</p>
        <center>
          <a href="${sprintUrl}" class="cta-button">
            Continue Your Sprint
          </a>
        </center>
        <p>Don't let the momentum fade. Log back in and complete your next task!</p>
        <p>Best,<br>The NeuraLaunch Team</p>
      </div>
      <div class="footer">
        <p>You're receiving this because you started a 72-hour sprint on NeuraLaunch.</p>
      </div>
    </body>
    </html>
  `;
}
