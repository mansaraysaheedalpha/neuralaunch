// src/app/api/test-docker/route.ts
import { NextResponse } from "next/server";
import Docker from "dockerode";
import { env } from "@/lib/env";

type DockerInfo = {
  ServerVersion: string;
  ContainersRunning: number;
  ContainersStopped: number;
  Images: number;
  OperatingSystem: string;
  Architecture: string;
};

function isDockerInfo(value: unknown): value is DockerInfo {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ServerVersion === "string" &&
    typeof v.ContainersRunning === "number" &&
    typeof v.ContainersStopped === "number" &&
    typeof v.Images === "number" &&
    typeof v.OperatingSystem === "string" &&
    typeof v.Architecture === "string"
  );
}

export async function GET() {
  try {
    const prodDockerHost = env.DOCKER_HOST_URL.split("://")[1].split(":")[0];
    const prodDockerPort = parseInt(
      env.DOCKER_HOST_URL.split(":")[2] || "2376"
    );

    const docker = new Docker({
      host: prodDockerHost,
      port: prodDockerPort,
      ca: env.DOCKER_CA_CERT,
      cert: env.DOCKER_CLIENT_CERT,
      key: env.DOCKER_CLIENT_KEY,
      protocol: "https",
    });

    const rawInfo = (await docker.info()) as unknown;
    if (!isDockerInfo(rawInfo)) {
      throw new Error("Invalid Docker info response from Docker daemon");
    }
    const info = rawInfo;

    return NextResponse.json({
      containersRunning: info.ContainersRunning,
      containersStopped: info.ContainersStopped,
      images: info.Images,
      operatingSystem: info.OperatingSystem,
      architecture: info.Architecture,
    });
  } catch (error) {
    console.error("Docker connection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
