// src/app/api/projects/[projectId]/critical-failures/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/projects/[projectId]/critical-failures
 * Fetch all critical failures for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = params;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // Filter by status (open, resolved, etc.)
    const severity = searchParams.get("severity"); // Filter by severity
    const waveNumber = searchParams.get("waveNumber"); // Filter by wave

    // Verify project access
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const project = await prisma.projectContext.findFirst({
      where: {
        projectId,
        userId: user.id,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Build query filters
    const where: any = {
      projectId,
      userId: user.id,
    };

    if (status) {
      where.status = status;
    }

    if (severity) {
      where.severity = severity;
    }

    if (waveNumber) {
      where.waveNumber = parseInt(waveNumber);
    }

    // Fetch critical failures
    const failures = await prisma.criticalFailure.findMany({
      where,
      orderBy: [
        { severity: "desc" }, // Critical first
        { createdAt: "desc" }, // Most recent first
      ],
      select: {
        id: true,
        taskId: true,
        waveNumber: true,
        phase: true,
        component: true,
        title: true,
        description: true,
        errorMessage: true,
        rootCause: true,
        severity: true,
        issuesFound: true,
        issuesRemaining: true,
        totalAttempts: true,
        lastAttemptAt: true,
        attemptHistory: true,
        status: true,
        escalatedToHuman: true,
        escalatedAt: true,
        notificationSent: true,
        resolvedAt: true,
        resolutionNotes: true,
        resolvedBy: true,
        stackTrace: true,
        context: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Get summary statistics
    const stats = await prisma.criticalFailure.groupBy({
      by: ["status", "severity"],
      where: {
        projectId,
        userId: user.id,
      },
      _count: true,
    });

    return NextResponse.json({
      success: true,
      failures,
      stats: {
        total: failures.length,
        byStatus: stats.reduce((acc: any, item) => {
          acc[item.status] = (acc[item.status] || 0) + item._count;
          return acc;
        }, {}),
        bySeverity: stats.reduce((acc: any, item) => {
          acc[item.severity] = (acc[item.severity] || 0) + item._count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    logger.error("Failed to fetch critical failures", { error });
    return NextResponse.json(
      { error: "Failed to fetch critical failures" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[projectId]/critical-failures
 * Update a critical failure status
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = params;
    const body = await req.json();
    const { failureId, status, resolutionNotes } = body;

    if (!failureId) {
      return NextResponse.json(
        { error: "failureId is required" },
        { status: 400 }
      );
    }

    // Verify user access
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify failure belongs to user
    const failure = await prisma.criticalFailure.findFirst({
      where: {
        id: failureId,
        projectId,
        userId: user.id,
      },
    });

    if (!failure) {
      return NextResponse.json(
        { error: "Critical failure not found or access denied" },
        { status: 404 }
      );
    }

    // Update the failure
    const updated = await prisma.criticalFailure.update({
      where: { id: failureId },
      data: {
        status: status || failure.status,
        resolvedAt: status === "resolved" ? new Date() : undefined,
        resolutionNotes:
          resolutionNotes !== undefined
            ? resolutionNotes
            : failure.resolutionNotes,
        resolvedBy:
          status === "resolved" ? "user" : failure.resolvedBy,
      },
    });

    logger.info("Critical failure updated", {
      failureId,
      projectId,
      status: updated.status,
    });

    return NextResponse.json({
      success: true,
      failure: updated,
    });
  } catch (error) {
    logger.error("Failed to update critical failure", { error });
    return NextResponse.json(
      { error: "Failed to update critical failure" },
      { status: 500 }
    );
  }
}
