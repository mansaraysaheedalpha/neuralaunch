import * as Sentry from "@sentry/nextjs";

export function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Enable logs in Sentry
    enableLogs: true,

    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // Adjust this value in production to reduce costs
    tracesSampleRate: 1.0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    integrations: [
      // Send console.log, console.warn, and console.error calls as logs to Sentry
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],

    // You can also set beforeSend to filter or modify events before they're sent to Sentry
    // beforeSend(event, hint) {
    //   return event;
    // },
  });
}

// Export navigation instrumentation hook
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
