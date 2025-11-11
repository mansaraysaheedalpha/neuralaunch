// src/app/api/projects/[projectId]/thoughts/route.ts
/**
 * API endpoint to get agent thoughts for a project
 * GET /api/projects/[projectId]/thoughts
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { thoughtStreamRegistry } from "@/lib/agents/thought-stream";

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

    // Get all thoughts for this project
    const thoughts = thoughtStreamRegistry.getProjectThoughts(projectId);

    return NextResponse.json({
      success: true,
      projectId,
      thoughts,
      count: thoughts.length,
    });
  } catch (error) {
    console.error("[GET_THOUGHTS_ERROR]", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve thoughts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
