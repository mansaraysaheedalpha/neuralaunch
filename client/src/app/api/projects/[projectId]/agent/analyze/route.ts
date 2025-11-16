// src/app/api/projects/[projectId]/agent/analyze/route.ts
/**
 * API endpoint to trigger Analyzer Agent
 * POST /api/projects/[projectId]/agent/analyze
 * GET  /api/projects/[projectId]/agent/analyze
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { analyzerAgent } from "@/lib/agents/analyzer/analyzer.agent";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

const analyzeRequestSchema = z.object({
  conversationId: z.string().cuid(),
  forceReanalyze: z.boolean().optional().default(false),
});

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

    // Rate limiting
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(session.user.id, clientIp);
    const rateLimitResult = await checkRateLimit({
      ...RATE_LIMITS.AI_GENERATION,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
            "X-RateLimit-Limit": RATE_LIMITS.AI_GENERATION.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    const { projectId } = await params;

    // Parse request body
    const body: unknown = await req.json();
    const validation = analyzeRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }

    const { conversationId, forceReanalyze } = validation.data;

    // Check if already analyzed (unless forcing re-analysis)
    if (!forceReanalyze) {
      const existing = await analyzerAgent.getExistingAnalysis(projectId);
      if (existing) {
        return NextResponse.json({
          success: true,
          message:
            "Analysis already exists. Use forceReanalyze=true to re-run.",
          projectId,
          cached: true,
        });
      }
    }

    // Get the blueprint from the conversation
    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        userId: session.user.id, // Ensure user owns this conversation
      },
      include: {
        messages: {
          where: { role: "model" },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const blueprintMessage = conversation.messages[0];
    if (!blueprintMessage?.content) {
      return NextResponse.json(
        { error: "No blueprint found in conversation" },
        { status: 404 }
      );
    }

    // Execute the Analyzer Agent
    const result = await analyzerAgent.execute({
      blueprint: blueprintMessage.content,
      conversationId,
      userId: session.user.id,
      projectId,
    });

    return NextResponse.json({
      success: true,
      projectId: result.projectId,
      stats: result.stats,
      validation: result.validation,
      message: result.message,
    });
  } catch (error) {
    console.error("[ANALYZE_ERROR]", error);
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve existing analysis
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

    // Get the project context
    const context = await prisma.projectContext.findUnique({
      where: {
        projectId,
        userId: session.user.id, // Ensure user owns this project
      },
    });

    if (!context) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      projectId,
      currentPhase: context.currentPhase,
      blueprint: context.blueprint,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
    });
  } catch (error) {
    console.error("[GET_ANALYSIS_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to retrieve analysis" },
      { status: 500 }
    );
  }
}
