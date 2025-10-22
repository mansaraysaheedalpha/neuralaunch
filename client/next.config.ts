import type { NextConfig as NextJsConfig } from "next";
import type { Configuration, RuleSetRule } from "webpack"; // Import RuleSetRule type

const nextConfig: NextJsConfig = {
  // productionBrowserSourceMaps: false, // You can keep or remove this, ignore-loader is more specific
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  webpack: (
    config: Configuration,
    { isServer }: { isServer: boolean }
  ): Configuration => {
    // --- ADD THIS RULE ---
    // Ignore .map files from chrome-aws-lambda to prevent build errors
    // Make sure 'ignore-loader' is installed as a dev dependency
    const ignoreMapRule: RuleSetRule = {
      // Explicitly type the rule
      test: /\.map$/,
      include: /node_modules[\\\/](chrome-aws-lambda|puppeteer-core)/, // Target specific packages
      use: "ignore-loader",
    };

    // Ensure config.module.rules exists before pushing
    const cfg = config as unknown as { module?: { rules?: RuleSetRule[] } };
    if (!cfg.module) {
      cfg.module = { rules: [] };
    }
    if (!cfg.module.rules) {
      cfg.module.rules = [];
    }
    cfg.module.rules.push(ignoreMapRule);
    // ----------------------

    // Keep Prisma handling (if needed)
    if (isServer) {
      // Optional: Sometimes needed if prisma client isn't found
      // config.externals = [...config.externals, '@prisma/client'];
    }

    return config;
  },
};

export default nextConfig;
