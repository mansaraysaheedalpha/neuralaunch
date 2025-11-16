import type { NextConfig as NextJsConfig } from "next";
import type { Configuration } from "webpack";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextJsConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: false, // Keep this
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  // CORS headers for API routes and public assets
  async headers() {
    return Promise.resolve([
      {
        // Apply CORS headers to all API routes
        source: "/api/:path*",
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
  webpack: (
    config: Configuration,
    { isServer }: { isServer: boolean }
  ): Configuration => {
    // Basic Prisma handling (can be refined if needed)
    if (isServer) {
      // If you encounter Prisma runtime errors, uncommenting this might help
      // config.externals = [...config.externals, '@prisma/client'];
    }

    // Ignore native modules that cause build errors
    if (!isServer) {
      // Client-side: ignore server-only packages
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("ssh2");
      }
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        os: false,
        path: false,
        "@sendgrid/mail": false,
        "@aws-sdk/client-ses": false,
      };
    } else {
      // Server-side: externalize optional email providers
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("@sendgrid/mail", "@aws-sdk/client-ses");
      }
    }

    // Ignore binary files from ssh2 and dockerode
    if (Array.isArray(config.externals)) {
      config.externals.push("ssh2");
    }
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.node$/,
      use: "ignore-loader",
    });

    return config;
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: "infinite-dynamics",
  project: "neuralaunch",

  // Disable source map upload if no auth token provided
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
};

// Make sure adding Sentry options is the last code to run before exporting
export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
