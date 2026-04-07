// src/app/api/health/route.ts
/**
 * Health Check Endpoint
 *
 * Public endpoint — no auth, by design (Vercel/Pingdom/etc.).
 *
 * Hardening (Stage 7.1 security pass):
 *   - Per-IP rate limit (60 req/min) so the endpoint cannot be used
 *     as a database hammer by anyone who knows the URL.
 *   - DB error message is logged server-side but NEVER returned to
 *     the client (CLAUDE.md security rule). The client only sees
 *     "down" without details. Internal stack traces and Prisma
 *     error codes never reach the public surface.
 *   - process.uptime() and npm_package_version removed from the
 *     response — both are minor information disclosure that gives
 *     attackers deployment age and build version with no benefit
 *     to legitimate health-check consumers.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimitByIp, HttpError, httpErrorToResponse } from "@/lib/validation/server-helpers";

interface HealthCheckResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  checks: {
    database: {
      status: "up" | "down";
      latency?: number;
    };
  };
}

export async function GET(request: Request) {
  try {
    await rateLimitByIp(request, "health", {
      maxRequests:   60,
      windowSeconds: 60,
    });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  const checks: HealthCheckResponse["checks"] = {
    database: { status: "down" },
  };

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status:  "up",
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    // Log the actual error server-side; the client gets no details
    logger.error(
      "Health check DB probe failed",
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  const status: HealthCheckResponse["status"] =
    checks.database.status === "up" ? "healthy" : "unhealthy";

  const response: HealthCheckResponse = {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(response, {
    status: status === "healthy" ? 200 : 503,
  });
}
