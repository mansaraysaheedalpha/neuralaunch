// src/app/api/projects/[projectId]/monitoring/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApiLogger } from "@/lib/logger";

/**
 * GET /api/projects/[projectId]/monitoring
 * Get monitoring data for a deployed project
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const logger = createApiLogger({
    path: "/api/projects/[projectId]/monitoring",
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await context.params;

    // 2. Generate mock monitoring data
    // In production, this would fetch real metrics from monitoring service
    const monitoringData = {
      health: "healthy" as const,
      metrics: {
        responseTime: {
          avg: 145,
          p95: 280,
          p99: 450,
        },
        errorRate: 0.001, // 0.1%
        uptime: 0.999, // 99.9%
        requests24h: 15420,
      },
      alerts: [], // No active alerts in demo
      optimizations: [
        {
          id: `opt_${Date.now()}_1`,
          type: "database",
          description: "Database query optimization applied",
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          impact: "+25% faster queries",
        },
        {
          id: `opt_${Date.now()}_2`,
          type: "image",
          description: "Image compression improved",
          timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          impact: "-40% asset size",
        },
      ],
    };

    logger.info("Monitoring data fetched successfully", {
      projectId,
      health: monitoringData.health,
    });

    return NextResponse.json(monitoringData);
  } catch (error) {
    logger.error("Failed to fetch monitoring data", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch monitoring data" },
      { status: 500 }
    );
  }
}
