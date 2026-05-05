// next.config.ts — targets Turbopack as the default compiler under
// Next.js 16.2.4. The `--webpack` fallback CLI flag still works against
// this same file (Next.js tolerates Turbopack-only keys when invoking the
// legacy compiler), so this config is dual-purpose during the burn-in
// window. See docs/migrations/turbopack-migration-research-2026-05.md.

import type { NextConfig as NextJsConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Configured app origin used for CORS Allow-Origin on /api/* responses.
// Reading process.env directly (rather than @/lib/env) because this
// file runs in the build/config context before the validated env
// module loads. Falls back to localhost for contributor dev where
// NEXT_PUBLIC_APP_URL is not set in .env.local. Vercel previews and
// production set NEXT_PUBLIC_APP_URL per environment, so the prod
// build resolves to the actual app origin.
const API_CORS_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL
  ?? process.env.NEXT_PUBLIC_SITE_URL
  ?? "http://localhost:3000";

const nextConfig: NextJsConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: false,

  // Workspace packages that ship raw TypeScript (.ts) sources rather
  // than pre-compiled JS. Listing them opts these local packages into
  // the SWC transpile pipeline (compiler-agnostic — Turbopack and Webpack
  // both honour this key).
  transpilePackages: [
    '@neuralaunch/api-types',
    '@neuralaunch/constants',
  ],

  // Server-side dependencies that must NOT be bundled — Next.js resolves
  // them via runtime `require()` instead. Replaces the legacy
  // `config.externals.push(...)` calls inside the old webpack hook.
  // Scoped to packages we actually import from `client/src/`. See
  // turbopack-migration-research-2026-05.md § "Server-Side Prisma and
  // Email SDK Externalization".
  serverExternalPackages: [
    '@prisma/client',
    '@paddle/paddle-node-sdk',
  ],

  // Turbopack equivalent of the legacy `config.resolve.fallback = { fs: false, ... }`
  // browser polyfill suppression. Turbopack does not accept `false` as a
  // resolution target, so each Node built-in is mapped to a physical empty
  // module under the `browser` condition. The server condition is left
  // unset, so server bundles continue to resolve the real built-ins.
  turbopack: {
    resolveAlias: {
      fs: { browser: './src/lib/empty.ts' },
      net: { browser: './src/lib/empty.ts' },
      tls: { browser: './src/lib/empty.ts' },
      crypto: { browser: './src/lib/empty.ts' },
      stream: { browser: './src/lib/empty.ts' },
      os: { browser: './src/lib/empty.ts' },
      path: { browser: './src/lib/empty.ts' },
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },

  // CORS headers for API routes and public assets — compiler-agnostic.
  async headers() {
    return Promise.resolve([
      {
        // /api/* (excluding NextAuth which handles its own CORS).
        //
        // Allow-Origin pinned to the configured app origin instead of "*".
        // The previous "*" + "Allow-Credentials: true" pairing was a
        // browser-rejected combination per the CORS spec — the wildcard
        // disables credential propagation, so cookie-bearing cross-origin
        // fetches were silently failing while the headers signalled
        // permissive intent that was never delivered. Pinning to the
        // configured origin lets cookie-bearing fetches from the app's
        // own browser origin work AND gives clean preflight responses
        // for legitimate cross-tool integrations going forward.
        //
        // Vary: Origin tells caches the response varies by Origin so a
        // proxy doesn't reuse the same CORS headers across origins
        // (defense-in-depth — the value is fixed today, but the header
        // is correct as soon as we add per-origin allow-listing).
        //
        // Mobile native callers are not browsers and do not honour CORS,
        // so they are unaffected by this change. NextAuth and webhook
        // routes are excluded by the source matcher above.
        source: "/api/((?!auth).*)*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin",      value: API_CORS_ORIGIN },
          { key: "Vary",                              value: "Origin" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
          },
        ],
      },
      {
        // Public landing pages — these are explicitly meant to be
        // embedded / shared cross-origin (validation pages live under
        // /l/[slug]). Wildcard is intentional here. No credentials
        // header so the spec mismatch on the /api/* block does not
        // apply.
        source: "/l/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin",  value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS" },
        ],
      },
    ]);
  },
};

// Sentry configuration. Under Turbopack, Sentry uses runtime
// OpenTelemetry instrumentation rather than build-time Webpack-plugin
// AST wrapping, so a number of legacy keys have become no-ops and are
// intentionally absent here. See turbopack-migration-research-2026-05.md
// § "Sentry on Turbopack".
const sentryWebpackPluginOptions = {
  org: "tabempa-engineering",
  project: "neuralaunch",

  // Note: disableServerWebpackPlugin / disableClientWebpackPlugin intentionally
  // omitted. Under Turbopack, Sentry uses runtime OpenTelemetry instrumentation,
  // not the build-time Webpack plugin. The gates are no-ops here.
  // See docs/migrations/turbopack-migration-research-2026-05.md.

  // Note: `automaticVercelMonitors` intentionally omitted — deprecated and
  // ineffective under Turbopack compilation environments.

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Annotate React components for Session Replay. Under Turbopack the
  // legacy top-level `reactComponentAnnotation` key is replaced by the
  // `_experimental.turbopackReactComponentAnnotation.enabled` key, which
  // hooks into the Rust compiler's AST stage to inject `data-sentry-component`
  // attributes at build time.
  _experimental: {
    turbopackReactComponentAnnotation: {
      enabled: true,
    },
  },

  // Route browser requests to Sentry through a Next.js rewrite to
  // circumvent ad-blockers. If middleware.ts is later introduced, its
  // matcher MUST exclude `/monitoring` (e.g. `(?!monitoring)`) so the
  // tunnel endpoint is not intercepted by auth logic.
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Phase 5 — explicit source-map upload + post-upload deletion. The
  // default in @sentry/nextjs v10.51 is already `true`, but explicit is
  // documentation: future contributors see the policy directly in
  // next.config.ts; a future SDK release that flips the default does
  // not silently change our behaviour. Pairs with
  // `productionBrowserSourceMaps: false` above and `hideSourceMaps:
  // true` immediately above — three layers of "no source maps reach the
  // production edge":
  //   1. Source maps are NOT served from `/_next/static/chunks/*.map`
  //      to the public (productionBrowserSourceMaps: false +
  //      hideSourceMaps: true).
  //   2. Maps that ARE produced as build artifacts are uploaded to
  //      Sentry, then deleted from `.next/` before the deploy
  //      uploads to Vercel's edge (this option).
  //   3. Sentry's stack-trace de-minification reads the uploaded
  //      copy via Debug IDs injected into the chunks; the public
  //      edge never has a `.map` file to leak.
  //
  // See docs/migrations/turbopack-migration-log.md § "Phase 5" for the
  // verification command sequence.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Note: `disableLogger` intentionally omitted. The Sentry SDK now logs
  // a deprecation warning for it under Turbopack ("Use
  // webpack.treeshake.removeDebugLogging instead. (Not supported with
  // Turbopack.)"). The replacement is webpack-only, and Turbopack already
  // tree-shakes dead branches — the original bundle-size optimisation is
  // now compiler-default. Verified in the 2026-05-02 production build log.
};

// Make sure adding Sentry options is the last code to run before exporting
export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
