// src/app/api/projects/[projectId]/files/route.ts
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
  files?: string[];
  filesCreated?: string[];
  filesData?: FileData[];
}

/**
 * GET /api/projects/[projectId]/files
 * Fetch all generated files for a project with their contents
 * Optional query params:
 * - waveNumber: Filter by specific wave
 * - agentName: Filter by specific agent
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

    const userId = session.user.id;

    // 2. Verify project ownership
    const project = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { userId: true, codebase: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const waveNumber = searchParams.get("waveNumber");
    const agentName = searchParams.get("agentName");

    // 4. Build query filters
    const where: Prisma.AgentTaskWhereInput = {
      projectId,
      status: "completed",
      output: {
        not: Prisma.JsonNull,
      },
    };

    if (waveNumber) {
      where.waveNumber = parseInt(waveNumber);
    }

    if (agentName) {
      where.agentName = agentName;
    }

    // 5. Fetch completed tasks with file outputs
    const tasks = await prisma.agentTask.findMany({
      where,
      select: {
        id: true,
        agentName: true,
        waveNumber: true,
        output: true,
        completedAt: true,
      },
      orderBy: {
        completedAt: "asc",
      },
    });

    // 6. Extract and aggregate files from task outputs
    const filesMap = new Map<
      string,
      {
        path: string;
        content: string;
        agentName: string;
        waveNumber: number | null;
        linesOfCode?: number;
        lastModified: Date;
      }
    >();

    for (const task of tasks) {
      const output = task.output as TaskOutput | null;

      if (!output) continue;

      // Extract files from various output formats
      const files = output.files || output.filesCreated || [];
      const filesData = output.filesData || [];

      // 🔍 DEBUG: Log what we're extracting
      logger.info(`[Files API] Task ${task.agentName}:`, {
        hasOutput: !!output,
        filesLength: Array.isArray(files) ? files.length : 0,
        filesDataLength: Array.isArray(filesData) ? filesData.length : 0,
        filesDataSample: Array.isArray(filesData) && filesData.length > 0
          ? { path: filesData[0]?.path, hasContent: !!filesData[0]?.content, contentLength: filesData[0]?.content?.length }
          : null,
      });

      // Handle array of file paths (can be strings or objects with path property)
      if (Array.isArray(files)) {
        files.forEach((fileItem: string | { path: string }) => {
          // Extract path from string or object
          const filePath = typeof fileItem === "string" ? fileItem : fileItem.path;

          if (filePath) {
            // Try to find content in filesData
            const fileData = filesData.find(
              (f: FileData) => f.path === filePath || f.filePath === filePath
            );

            logger.info(`[Files API] Processing file:`, {
              filePath,
              fileItemType: typeof fileItem,
              foundInFilesData: !!fileData,
              hasContent: !!fileData?.content,
              contentLength: fileData?.content?.length,
            });

            if (fileData && fileData.content) {
              filesMap.set(filePath, {
                path: filePath,
                content: fileData.content,
                agentName: task.agentName,
                waveNumber: task.waveNumber,
                linesOfCode: fileData.linesOfCode,
                lastModified: task.completedAt || new Date(),
              });
            } else {
              logger.warn(`[Files API] No content found for file: ${filePath}`);
            }
          }
        });
      }

      // Handle filesData array directly
      if (Array.isArray(filesData)) {
        filesData.forEach((file: FileData) => {
          const filePath = file.path || file.filePath;
          if (filePath && file.content) {
            filesMap.set(filePath, {
              path: filePath,
              content: file.content,
              agentName: task.agentName,
              waveNumber: task.waveNumber,
              linesOfCode: file.linesOfCode || countLines(file.content),
              lastModified: task.completedAt || new Date(),
            });
          }
        });
      }
    }

    // 7. Convert map to array
    const files = Array.from(filesMap.values());

    logger.info(`Retrieved ${files.length} files for project ${projectId}`);

    return NextResponse.json({
      projectId,
      totalFiles: files.length,
      files: files.map((f) => ({
        path: f.path,
        content: f.content,
        agentName: f.agentName,
        waveNumber: f.waveNumber,
        linesOfCode: f.linesOfCode,
        lastModified: f.lastModified.toISOString(),
      })),
      filters: {
        waveNumber: waveNumber ? parseInt(waveNumber) : null,
        agentName: agentName || null,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch project files", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Count lines of code in a file
 */
function countLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}
