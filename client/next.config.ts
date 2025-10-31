import type { NextConfig as NextJsConfig } from "next";
import type { Configuration } from "webpack";

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
      config.externals.push("ssh2");
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
      };
    }

    // Ignore binary files from ssh2 and dockerode
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.node$/,
      use: "ignore-loader",
    });

    return config;
  },
};

export default nextConfig;
