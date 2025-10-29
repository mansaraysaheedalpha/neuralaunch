import type { NextConfig as NextJsConfig } from "next";
import type { Configuration } from "webpack";

const nextConfig: NextJsConfig = {
  productionBrowserSourceMaps: false, // Keep this
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
    // Basic Prisma handling (can be refined if needed)
    if (isServer) {
      // If you encounter Prisma runtime errors, uncommenting this might help
      // config.externals = [...config.externals, '@prisma/client'];
    }

    // Exclude native .node modules from webpack processing (dockerode issue)
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.node$/,
      loader: "ignore-loader",
    });

    // NO ignore-loader needed for @sparticuz/chromium usually

    return config;
  },
};

export default nextConfig;
