import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/projects/context
 * View all projects and their context status
 */
export async function GET(req: NextRequest) {
  try {
    const projects = await prisma.project.findMany({
      include: {
        ProjectContext: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });

    const projectsWithStatus = projects.map((project) => {
      const ctx = project.ProjectContext;
      const techStack = ctx?.techStack as any;
      const architecture = ctx?.architecture as any;
      const codebase = ctx?.codebase as any;

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        createdAt: project.createdAt,
        hasContext: !!ctx,
        contextStatus: ctx
          ? {
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
            }
          : null,
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

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { ProjectContext: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (techStack) updateData.techStack = techStack;
    if (architecture) updateData.architecture = architecture;
    if (codebase) updateData.codebase = codebase;

    // Upsert ProjectContext
    const context = await prisma.projectContext.upsert({
      where: { projectId },
      create: {
        projectId,
        techStack: techStack || {},
        architecture: architecture || {},
        codebase: codebase || {},
      },
      update: updateData,
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
