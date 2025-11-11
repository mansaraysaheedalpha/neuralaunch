// src/app/api/projects/[projectId]/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApiLogger } from "@/lib/logger";

/**
 * GET /api/projects/[projectId]/tasks
 * 
 * Fetch tasks for a specific project
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

    // 2. Return mock tasks for now
    // In a real implementation, this would fetch from the database
    const tasks = [];
    const waves = [];

    logger.info("Tasks fetched successfully", { projectId, userId });

    return NextResponse.json({
      tasks,
      waves,
    });
  } catch (error) {
    logger.error("Failed to fetch tasks", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
