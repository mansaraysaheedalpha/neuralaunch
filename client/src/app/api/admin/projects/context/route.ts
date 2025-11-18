import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface TechStack {
  language?: string;
  backend?: { framework?: string; runtime?: string };
  database?: { type?: string; name?: string };
  [key: string]: unknown;
}

interface Architecture {
  patterns?: unknown;
  [key: string]: unknown;
}

interface Codebase {
  githubRepoUrl?: string;
  [key: string]: unknown;
}

/**
 * GET /api/admin/projects/context
 * View all projects and their context status
 */
export async function GET() {
  try {
    const projectContexts = await prisma.projectContext.findMany({
      include: {
        conversation: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });

    const projectsWithStatus = projectContexts.map((ctx) => {
      const techStack = ctx.techStack as TechStack | null;
      const architecture = ctx.architecture as Architecture | null;
      const codebase = ctx.codebase as Codebase | null;

      return {
        id: ctx.projectId,
        conversationId: ctx.conversationId,
        conversationTitle: ctx.conversation.title,
        currentPhase: ctx.currentPhase,
        createdAt: ctx.createdAt,
        hasContext: true,
        contextStatus: {
          techStack: {
            complete:
              !!techStack?.backend?.framework &&
              !!techStack?.database?.type &&
              !!techStack?.language,
            hasBackend: !!techStack?.backend?.framework,
            hasDatabase: !!techStack?.database?.type,
            hasLanguage: !!techStack?.language,
            data: techStack,
          },
          architecture: {
            present: architecture && Object.keys(architecture).length > 0,
            data: architecture,
          },
          codebase: {
            hasGithub: !!codebase?.githubRepoUrl,
            data: codebase,
          },
        },
      };
    });

    return NextResponse.json({
      success: true,
      projects: projectsWithStatus,
      count: projectsWithStatus.length,
    });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/projects/context
 * Update or create ProjectContext for a project
 *
 * Body: {
 *   projectId: string;
 *   techStack?: object;
 *   architecture?: object;
 *   codebase?: object;
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, techStack, architecture, codebase } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    // Check if project context exists
    const existingContext = await prisma.projectContext.findUnique({
      where: { projectId },
    });

    if (!existingContext) {
      return NextResponse.json(
        { success: false, error: 'Project context not found. Please provide conversationId and userId to create it.' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: {
      techStack?: Prisma.InputJsonValue;
      architecture?: Prisma.InputJsonValue;
      codebase?: Prisma.InputJsonValue;
    } = {};
    if (techStack) updateData.techStack = techStack as Prisma.InputJsonValue;
    if (architecture) updateData.architecture = architecture as Prisma.InputJsonValue;
    if (codebase) updateData.codebase = codebase as Prisma.InputJsonValue;

    // Update existing ProjectContext (no upsert since we checked it exists)
    const context = await prisma.projectContext.update({
      where: { projectId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: 'ProjectContext updated successfully',
      context,
    });
  } catch (error) {
    console.error('Failed to update project context:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
