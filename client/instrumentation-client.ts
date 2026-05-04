// instrumentation-client.ts — Sentry SDK init for the browser runtime.
// Source-of-truth refs:
//   - client/SENTRY_RESEARCH_DOC.txt § "Tripartite Initialization Structure"
//   - docs/migrations/turbopack-migration-research-2026-05.md § "Sentry on Turbopack"
//   - docs/migrations/turbopack-migration-log.md § "Sentry Integration"
//
// Phase 1 deltas (vs. wizard scaffold):
//   - removed enableLogs + consoleLoggingIntegration. Logger output flows
//     through src/lib/logger.ts; Sentry receives errors via captureException
//     and traces via OpenTelemetry, not console-piping.
//   - added replayIntegration with mandatory privacy keys (paired with
//     _experimental.turbopackReactComponentAnnotation in next.config.ts).
//   - prod tracesSampleRate dropped from 1.0 to 0.1; dev unchanged.
//   - error replay always at 1.0.
//
// Phase 4 deltas: beforeSend hook from `lib/observability/scrub-browser`
// runs on every client error event. Same shape as the server hook (drop
// healthcheck errors, strip query strings, scrub PII patterns + denylist
// keys). `scrub-browser.ts` mirrors `scrub.ts` minus the `server-only`
// import; both share `scrub-patterns.ts`.
import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "@/lib/observability/scrub-browser";

const isDevelopment = process.env.NODE_ENV === "development";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  debug: false,

  // Trace sampling. Polling endpoints are dropped server-side via
  // sentry.server.config.ts's tracesSampler — client only sees pageload/
  // navigation transactions, which we sample at 10% in prod, 100% in dev.
  tracesSampleRate: isDevelopment ? 1.0 : 0.1,

  // Session Replay — privacy-first defaults. Non-negotiable per
  // client/SENTRY_RESEARCH_DOC.txt § "Data Governance" and CLAUDE.md
  // § "Security": NeuraLaunch handles user IP (startup ideas), so
  // unmasked replay is a hard product failure.
  replaysSessionSampleRate: isDevelopment ? 1.0 : 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      networkDetailAllowUrls: [],
    }),
  ],

  // Hook widening — see sentry.server.config.ts for rationale.
  beforeSend: beforeSend as Parameters<typeof Sentry.init>[0] extends infer O
    ? O extends { beforeSend?: infer F } ? F : never
    : never,
});

// App Router navigation instrumentation — required for client-side route
// changes to register as Sentry transactions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
