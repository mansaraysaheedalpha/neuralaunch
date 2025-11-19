// src/app/api/projects/[projectId]/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createApiLogger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

interface TaskInput {
  category?: string;
}

/**
 * GET /api/projects/[projectId]/tasks
 *
 * Fetch tasks for a specific project with pagination and filtering
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20, max: 100)
 * - status: Filter by status (pending|in_progress|completed|failed)
 * - agentName: Filter by agent name
 * - wave: Filter by wave number
 * - category: Filter by task category
 * - priority: Filter by priority level
 * - sortBy: Sort field (priority|createdAt|completedAt)
 * - sortOrder: Sort direction (asc|desc)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/tasks`,
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("Unauthorized tasks fetch request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { userId: true },
    });

    if (!projectContext) {
      logger.warn("Project not found", { projectId, userId });
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      logger.warn("Unauthorized project access", { projectId, userId });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Parse query parameters
    const searchParams = req.nextUrl.searchParams;

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20"))
    );
    const skip = (page - 1) * limit;

    // Filters
    const status = searchParams.get("status");
    const agentName = searchParams.get("agentName");
    const waveNumber = searchParams.get("wave");
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");

    // Sorting
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "asc";

    // 4. Build where clause
    const where: Prisma.AgentTaskWhereInput = { projectId };

    if (status) {
      where.status = status;
    }

    if (agentName) {
      where.agentName = agentName;
    }

    if (waveNumber) {
      where.waveNumber = parseInt(waveNumber);
    }

    if (priority) {
      where.priority = parseInt(priority);
    }

    // Category filter (stored in input JSON)
    // We'll filter this after fetching since it's nested in JSON

    // 5. Build orderBy clause
    const orderBy: Prisma.AgentTaskOrderByWithRelationInput[] = [];

    // Primary sort
    if (sortBy === "priority") {
      orderBy.push({ priority: sortOrder as Prisma.SortOrder });
    } else if (sortBy === "completedAt") {
      orderBy.push({ completedAt: sortOrder as Prisma.SortOrder });
    } else {
      orderBy.push({ createdAt: sortOrder as Prisma.SortOrder });
    }

    // Secondary sorts for consistency
    if (sortBy !== "waveNumber") {
      orderBy.push({ waveNumber: "asc" });
    }
    if (sortBy !== "priority") {
      orderBy.push({ priority: "asc" });
    }

    // 6. Fetch tasks with pagination
    const [tasks, totalCount] = await Promise.all([
      prisma.agentTask.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          projectId: true,
          agentName: true,
          status: true,
          priority: true,
          waveNumber: true,
          complexity: true,
          estimatedLines: true,
          prNumber: true,
          prUrl: true,
          reviewStatus: true,
          reviewScore: true,
          criticalIssues: true,
          input: true,
          output: true,
          error: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          retryCount: true,
          fixAttempts: true,
          createdAt: true,
        },
      }),
      prisma.agentTask.count({ where }),
    ]);

    // 7. Apply client-side category filter if needed
    let filteredTasks = tasks;
    if (category) {
      filteredTasks = tasks.filter((task) => {
        const input = task.input as TaskInput | null;
        return input?.category === category;
      });
    }

    // 8. Fetch waves for this project with their associated tasks
    const waves = await prisma.executionWave.findMany({
      where: { projectId },
      orderBy: { waveNumber: "asc" },
      select: {
        id: true,
        projectId: true,
        waveNumber: true,
        status: true,
        taskCount: true,
        completedCount: true,
        failedCount: true,
        fixAttempts: true,
        escalatedToHuman: true,
        finalReviewScore: true,
        criticalIssuesCount: true,
        previewUrl: true,
        startedAt: true,
        completedAt: true,
      },
    });

    // 8b. Get all tasks for all waves to associate them
    const allWaveTasks = await prisma.agentTask.findMany({
      where: {
        projectId,
        waveNumber: { not: null },
      },
      orderBy: [
        { waveNumber: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        agentName: true,
        status: true,
        waveNumber: true,
        input: true,
        durationMs: true,
        createdAt: true,
      },
    });

    // 8c. Map tasks to their waves
    const wavesWithTasks = waves.map((wave) => ({
      ...wave,
      number: wave.waveNumber,
      tasks: allWaveTasks.filter((task) => task.waveNumber === wave.waveNumber),
    }));

    // 9. Calculate task statistics
    const taskStats = await prisma.agentTask.groupBy({
      by: ["status"],
      where: { projectId },
      _count: true,
    });

    const statsMap = taskStats.reduce(
      (acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      },
      {} as Record<string, number>
    );

    // 10. Get agent statistics
    const agentStats = await prisma.agentTask.groupBy({
      by: ["agentName"],
      where: { projectId },
      _count: true,
    });

    const agentStatsMap = agentStats.reduce(
      (acc, stat) => {
        acc[stat.agentName] = stat._count;
        return acc;
      },
      {} as Record<string, number>
    );

    // 11. Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasMore = page < totalPages;
    const hasPrevious = page > 1;

    logger.info("Tasks fetched successfully", {
      projectId,
      userId,
      page,
      limit,
      totalCount,
      tasksReturned: filteredTasks.length,
      wavesCount: wavesWithTasks.length,
    });

    return NextResponse.json({
      tasks: filteredTasks,
      waves: wavesWithTasks,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasMore,
        hasPrevious,
        showing: {
          from: skip + 1,
          to: Math.min(skip + limit, totalCount),
          of: totalCount,
        },
      },
      statistics: {
        byStatus: statsMap,
        byAgent: agentStatsMap,
        total: totalCount,
        completed: statsMap.completed || 0,
        inProgress: statsMap.in_progress || 0,
        pending: statsMap.pending || 0,
        failed: statsMap.failed || 0,
      },
      filters: {
        status,
        agentName,
        wave: waveNumber,
        category,
        priority,
      },
      sorting: {
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch tasks", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[projectId]/tasks/summary
 *
 * Get a quick summary of tasks (no pagination, minimal data)
 */
export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/tasks/summary`,
    method: "HEAD",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { userId: true },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Get quick stats
    const [totalTasks, taskStats, waveCount] = await Promise.all([
      prisma.agentTask.count({ where: { projectId } }),
      prisma.agentTask.groupBy({
        by: ["status"],
        where: { projectId },
        _count: true,
      }),
      prisma.executionWave.count({ where: { projectId } }),
    ]);

    const statsMap = taskStats.reduce(
      (acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      },
      {} as Record<string, number>
    );

    logger.info("Task summary fetched", { projectId, userId, totalTasks });

    return NextResponse.json({
      projectId,
      totalTasks,
      totalWaves: waveCount,
      statistics: {
        completed: statsMap.completed || 0,
        inProgress: statsMap.in_progress || 0,
        pending: statsMap.pending || 0,
        failed: statsMap.failed || 0,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch task summary", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch task summary" },
      { status: 500 }
    );
  }
}
