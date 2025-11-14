// src/app/api/health/route.ts
/**
 * Health Check Endpoint
 * 
 * Provides system health status for monitoring and alerting
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";

interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    database: {
      status: "up" | "down";
      latency?: number;
      error?: string;
    };
  };
  version: string;
  uptime: number;
}

export async function GET() {
  const checks: HealthCheckResponse["checks"] = {
    database: { status: "down" },
  };

  // Check database connection
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;
    
    checks.database = {
      status: "up",
      latency: dbLatency,
    };
  } catch (error) {
    checks.database = {
      status: "down",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Determine overall health status
  const allUp = Object.values(checks).every((check) => check.status === "up");
  const someDown = Object.values(checks).some((check) => check.status === "down");

  const status: HealthCheckResponse["status"] = allUp
    ? "healthy"
    : someDown
    ? "unhealthy"
    : "degraded";

  const response: HealthCheckResponse = {
    status,
    timestamp: new Date().toISOString(),
    checks,
    version: process.env.npm_package_version || "unknown",
    uptime: process.uptime(),
  };

  const statusCode = status === "healthy" ? 200 : status === "degraded" ? 200 : 503;

  return NextResponse.json(response, { status: statusCode });
}
