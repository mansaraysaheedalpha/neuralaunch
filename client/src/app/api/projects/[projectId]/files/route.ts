import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createApiLogger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

interface FileData {
  path?: string;
  filePath?: string;
  content?: string;
  linesOfCode?: number;
}

interface TaskOutput {
  files?: string[] | Array<{ path: string }>;
  filesCreated?: string[] | Array<{ path: string }>;
  filesData?: FileData[];
}

/**
 * GET /api/projects/[projectId]/files
 * Fetch all generated files for a project with their contents
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const logger = createApiLogger({
    path: `/api/projects/${projectId}/files`,
    method: "GET",
  });

  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify project ownership
    const project = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { userId: true },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Fetch completed tasks with file outputs
    const tasks = await prisma.agentTask.findMany({
      where: {
        projectId,
        status: "completed",
        output: { not: Prisma.JsonNull },
      },
      select: {
        agentName: true,
        waveNumber: true,
        output: true,
        completedAt: true,
      },
      orderBy: { completedAt: "asc" }, // Oldest first, so newer overwrites older
    });

    // 4. Extract files (Using a Map to handle overwrites correctly)
    const filesMap = new Map<
      string,
      {
        path: string;
        content: string;
        agentName: string;
        linesOfCode: number;
        lastModified: Date;
      }
    >();

    for (const task of tasks) {
      const output = task.output as unknown as TaskOutput;
      if (!output) continue;

      // Strategy: Look for 'filesData' first (contains content), then fallback
      const richFiles = output.filesData || [];

      for (const file of richFiles) {
        // Normalize path: remove leading ./ or /
        const rawPath = file.path || file.filePath;
        if (!rawPath || !file.content) continue;

        const cleanPath = rawPath.replace(/^(\.\/|\/)/, "");

        filesMap.set(cleanPath, {
          path: cleanPath,
          content: file.content,
          agentName: task.agentName,
          linesOfCode: file.linesOfCode || file.content.split("\n").length,
          lastModified: task.completedAt || new Date(),
        });
      }
    }

    // 5. Convert to array
    const files = Array.from(filesMap.values());

    return NextResponse.json({
      projectId,
      totalFiles: files.length,
      files: files.map((f) => ({
        ...f,
        lastModified: f.lastModified.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Failed to fetch project files", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
