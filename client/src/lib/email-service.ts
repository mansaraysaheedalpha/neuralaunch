// lib/email-service.ts
// PRODUCTION-READY email service using Resend

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

export async function sendWelcomeEmail({
  to,
  name,
  startupName,
  landingPageUrl,
}: WelcomeEmailParams): Promise<boolean> {
  try {
    const { data, error } = await resend.emails.send({
      // --- CHANGE #1: Use your verified domain ---
      from: "IdeaSpark <welcome@infinite-dynamics.com>",
      to: [to],
      subject: `Thanks for joining ${startupName}! 🚀`,
      html: generateWelcomeEmailHTML({ name, startupName, landingPageUrl }),
      text: generateWelcomeEmailText({ name, startupName, landingPageUrl }),
    });

    if (error) {
      console.error("Failed to send welcome email:", error);
      return false;
    }

    console.log("Welcome email sent successfully:", data);
    return true;
  } catch (error) {
    console.error("Email service error:", error);
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
    <p>Powered by <a href="https://startupvalidator.app">IdeaSpark</a></p>
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
Powered by IdeaSpark - https://startupvalidator.app
  `;
}

// Your existing notifyFounderOfSignup function is already correct since it uses info@infinite-dynamics.com
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
    const { error } = await resend.emails.send({
      from: "IdeaSpark <notifications@infinite-dynamics.com>", // Using a different address for clarity
      to: [founderEmail],
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
      `,
    });

    if (error) {
      console.error("Failed to notify founder:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Founder notification error:", error);
    return false;
  }
}

export async function sendSprintReminderEmail(
  params: SprintReminderParams
): Promise<boolean> {
  try {
    const { data, error } = await resend.emails.send({
      // --- CHANGE #2: Use your verified domain ---
      from: "IdeaSpark <reminders@infinite-dynamics.com>",
      to: [params.to],
      subject: `Keep up the momentum on ${params.startupName}! 🚀`,
      html: generateReminderEmailHTML(params),
    });

    if (error) {
      console.error("Failed to send sprint reminder email:", error);
      return false;
    }

    console.log(`Reminder email sent successfully to ${params.to}`, data?.id);
    return true;
  } catch (error) {
    console.error("Sprint reminder email service error:", error);
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
        <h1>IdeaSpark Sprint</h1>
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
        <p>Best,<br>The IdeaSpark Team</p>
      </div>
      <div class="footer">
        <p>You're receiving this because you started a 72-hour sprint on IdeaSpark.</p>
      </div>
    </body>
    </html>
  `;
}
