// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createApiLogger } from "@/lib/logger";

/**
 * GET /api/projects
 * 
 * Fetch all projects for the authenticated user
 */
export async function GET(req: NextRequest) {
  const logger = createApiLogger({
    path: "/api/projects",
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("Unauthorized projects list request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Fetch projects from database
    // Note: We're using the Conversation model as a proxy for projects
    // since the current schema doesn't have a dedicated Project model
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Transform conversations to project format
    const projects = conversations.map((conv) => ({
      id: conv.id,
      name: conv.title || "Untitled Project",
      description: undefined,
      status: "completed" as const, // Default status
      progress: 100,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    }));

    logger.info("Projects fetched successfully", {
      userId,
      count: projects.length,
    });

    return NextResponse.json({
      projects,
      count: projects.length,
    });
  } catch (error) {
    logger.error("Failed to fetch projects", error as Error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
