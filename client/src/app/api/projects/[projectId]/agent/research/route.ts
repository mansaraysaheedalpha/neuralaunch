// src/app/api/projects/[projectId]/agent/research/route.ts
/**
 * API endpoint to trigger Research Agent
 * POST /api/projects/[projectId]/agent/research
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { researchAgent } from "@/lib/agents/research/research.agent";
import prisma from "@/lib/prisma";

export async function POST(
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

    // Verify project exists and user owns it
    const context = await prisma.projectContext.findUnique({
      where: {
        projectId,
        userId: session.user.id,
      },
    });

    if (!context) {
      return NextResponse.json(
        { error: "Project not found. Run analysis first." },
        { status: 404 }
      );
    }

    // Check if analysis phase is complete
    if (!context.blueprint) {
      return NextResponse.json(
        { error: "Blueprint not analyzed yet. Run /analyze first." },
        { status: 400 }
      );
    }

    // Execute Research Agent
    const result = await researchAgent.execute({
      projectId,
      userId: session.user.id,
      conversationId: context.conversationId,
    });

    return NextResponse.json({
      success: true,
      projectId,
      recommendations: result.recommendations,
      architecturePattern: result.architecturePattern,
      message: result.message,
    });
  } catch (error) {
    console.error("[RESEARCH_ERROR]", error);
    return NextResponse.json(
      {
        error: "Research failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve research results
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;

    const context = await prisma.projectContext.findUnique({
      where: {
        projectId,
        userId: session.user.id,
      },
      select: {
        techStack: true,
        currentPhase: true,
      },
    });

    if (!context) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!context.techStack) {
      return NextResponse.json(
        { error: "Research not completed yet" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      projectId,
      currentPhase: context.currentPhase,
      techStack: context.techStack,
    });
  } catch (error) {
    console.error("[GET_RESEARCH_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to retrieve research" },
      { status: 500 }
    );
  }
}
