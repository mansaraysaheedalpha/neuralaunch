// src/app/api/debug/sandbox-health/route.ts
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import Docker from "dockerode";

export async function GET() {
  try {
    const IS_PRODUCTION = env.NODE_ENV === "production";

    if (IS_PRODUCTION) {
      const prodDockerHost = env.DOCKER_HOST_URL.split("://")[1].split(":")[0];
      const prodDockerPort = env.DOCKER_HOST_URL.split(":")[2] || "2376";

      const docker = new Docker({
        host: prodDockerHost,
        port: parseInt(prodDockerPort),
        ca: env.DOCKER_CA_CERT,
        cert: env.DOCKER_CLIENT_CERT,
        key: env.DOCKER_CLIENT_KEY,
        protocol: "https",
      });

      // Test ping
      await docker.ping();

      // Test list containers
      const containers = await docker.listContainers({ all: true });

      return NextResponse.json({
        success: true,
        dockerHost: prodDockerHost,
        dockerPort: prodDockerPort,
        containersCount: containers.length,
        message: "Docker connection successful",
      });
    } else {
      return NextResponse.json({
        success: false,
        message: "This endpoint is for production debugging only",
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
