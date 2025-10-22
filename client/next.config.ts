import type { NextConfig as NextJsConfig } from "next";
import type { Configuration } from "webpack";

const nextConfig: NextJsConfig = {
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  webpack: (config: Configuration, { isServer }: { isServer: boolean }): Configuration => {
    // Keep Prisma handling
    if (isServer) {
      // config.externals = [...config.externals, '@prisma/client']; // Optional externals
    }
    return config;
  },
};

export default nextConfig;
