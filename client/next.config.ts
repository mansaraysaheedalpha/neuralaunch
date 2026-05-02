// next.config.ts — targets Turbopack as the default compiler under
// Next.js 16.2.4. The `--webpack` fallback CLI flag still works against
// this same file (Next.js tolerates Turbopack-only keys when invoking the
// legacy compiler), so this config is dual-purpose during the burn-in
// window. See docs/migrations/turbopack-migration-research-2026-05.md.

import type { NextConfig as NextJsConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
        // Apply CORS headers to API routes (excluding auth routes - NextAuth handles its own CORS)
        source: "/api/((?!auth).*)*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" }, // Will be overridden by middleware for specific origins
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
        // Apply CORS headers to public landing pages
        source: "/l/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
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
  org: "infinite-dynamics",
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

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
};

// Make sure adding Sentry options is the last code to run before exporting
export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
