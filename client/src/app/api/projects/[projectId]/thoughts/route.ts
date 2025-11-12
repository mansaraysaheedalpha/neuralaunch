// app/api/projects/[projectId]/thoughts/route.ts - READS FROM DATABASE
/**
 * API endpoint to get agent thoughts for a project
 * GET /api/projects/[projectId]/thoughts?after=2024-01-01T00:00:00Z
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { thoughtStreamRegistry } from "@/lib/agents/thought-stream";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const afterParam = searchParams.get("after");

    // ✅ UPDATED: Read from database via registry
    const allThoughts =
      await thoughtStreamRegistry.getProjectThoughts(projectId);

    // Filter thoughts after timestamp (for incremental fetch)
    let thoughts = allThoughts;

    if (afterParam) {
      try {
        const afterDate = new Date(afterParam);

        thoughts = allThoughts.filter((thought) => {
          return new Date(thought.timestamp) > afterDate;
        });

        logger.info(
          `[Thoughts API] Incremental fetch: ${thoughts.length} new thoughts after ${afterParam}`,
          {
            projectId,
            totalThoughts: allThoughts.length,
            newThoughts: thoughts.length,
          }
        );
      } catch (error) {
        logger.warn(`[Thoughts API] Invalid 'after' parameter: ${afterParam}`, {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
        thoughts = allThoughts;
      }
    }

    // Convert Date objects to ISO strings for JSON serialization
    const serializedThoughts = thoughts.map((t) => ({
      ...t,
      timestamp:
        t.timestamp instanceof Date ? t.timestamp.toISOString() : t.timestamp,
    }));

    return NextResponse.json({
      success: true,
      projectId,
      thoughts: serializedThoughts,
      count: thoughts.length,
      totalCount: allThoughts.length,
      isIncremental: !!afterParam,
    });
  } catch (error) {
    logger.error(
      "[Thoughts API] Failed to retrieve thoughts",
      error instanceof Error ? error : undefined,
      {
        error: error instanceof Error ? error.message : String(error),
      }
    );

    return NextResponse.json(
      {
        error: "Failed to retrieve thoughts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[projectId]/thoughts
 * Clear all thoughts for a project
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;

    // ✅ UPDATED: Delete from database
    await thoughtStreamRegistry.deleteProjectThoughts(projectId);

    // Also clear in-memory registry
    thoughtStreamRegistry.clearProject(projectId);

    logger.info(`[Thoughts API] Cleared thoughts for project ${projectId}`);

    return NextResponse.json({
      success: true,
      message: "Thoughts cleared successfully",
      projectId,
    });
  } catch (error) {
    logger.error(
      "[Thoughts API] Failed to clear thoughts",
      error instanceof Error ? error : undefined
    );

    return NextResponse.json(
      {
        error: "Failed to clear thoughts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
