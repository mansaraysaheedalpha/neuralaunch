// src/app/api/projects/[projectId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createApiLogger } from "@/lib/logger";

/**
 * GET /api/projects/[projectId]
 * 
 * Fetch a specific project by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  
  const logger = createApiLogger({
    path: `/api/projects/${projectId}`,
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("Unauthorized project fetch request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Fetch project/conversation from database
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: projectId,
        userId: userId,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!conversation) {
      logger.warn("Project not found", { projectId, userId });
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Transform to project format
    const project = {
      id: conversation.id,
      name: conversation.title || "Untitled Project",
      description: undefined,
      status: "completed" as const,
      progress: 100,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };

    logger.info("Project fetched successfully", { projectId, userId });

    return NextResponse.json(project);
  } catch (error) {
    logger.error("Failed to fetch project", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[projectId]
 * 
 * Delete a specific project
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  
  const logger = createApiLogger({
    path: `/api/projects/${projectId}`,
    method: "DELETE",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("Unauthorized project delete request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Verify ownership and delete
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: projectId,
        userId: userId,
      },
    });

    if (!conversation) {
      logger.warn("Project not found for deletion", { projectId, userId });
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Delete the conversation (this will cascade delete related data)
    await prisma.conversation.delete({
      where: {
        id: projectId,
      },
    });

    logger.info("Project deleted successfully", { projectId, userId });

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    logger.error("Failed to delete project", error as Error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
