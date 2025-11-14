// src/lib/notifications/email-templates.ts
/**
 * Email Templates for Notifications
 */

const emailStyles = `
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
  .content {
    margin: 20px 0;
  }
  .info-box {
    background: #f8f9fa;
    border-left: 4px solid #007bff;
    padding: 15px;
    margin: 20px 0;
  }
  .success-box {
    border-left-color: #28a745;
  }
  .error-box {
    border-left-color: #dc3545;
  }
  .warning-box {
    border-left-color: #ffc107;
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
`;

export function buildSuccessEmail(
  userName: string,
  title: string,
  message: string,
  details: string[],
  actionUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ ${title}</h1>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>${message}</p>
      <div class="info-box success-box">
        ${details.filter(d => d).join("<br>")}
      </div>
      <div style="text-align: center;">
        <a href="${actionUrl}" class="button">View Details →</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated notification from NeuraLaunch</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function buildErrorEmail(
  userName: string,
  title: string,
  message: string,
  details: string[],
  actionUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ ${title}</h1>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>${message}</p>
      <div class="info-box error-box">
        ${details.filter(d => d).join("<br>")}
      </div>
      <div style="text-align: center;">
        <a href="${actionUrl}" class="button">View Details →</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated notification from NeuraLaunch</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function buildAlertEmail(
  userName: string,
  alertType: string,
  severity: string,
  message: string,
  metrics: Record<string, any>,
  actionUrl: string
): string {
  const severityEmoji = severity === "critical" ? "🚨" : severity === "error" ? "⚠️" : "ℹ️";
  const metricsHtml = Object.entries(metrics)
    .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
    .join("<br>");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${severityEmoji} ${alertType}</h1>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>${message}</p>
      ${metricsHtml ? `<div class="info-box warning-box">${metricsHtml}</div>` : ""}
      <div style="text-align: center;">
        <a href="${actionUrl}" class="button">View Monitoring Dashboard →</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated alert from NeuraLaunch</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function buildGenericEmail(
  userName: string,
  title: string,
  message: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>${message}</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from NeuraLaunch</p>
    </div>
  </div>
</body>
</html>
  `;
}
