// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createApiLogger } from "@/lib/logger";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";
import { createCORSHandler, AUTHENTICATED_API_CORS } from "@/lib/cors";

/**
 * GET /api/projects
 *
 * Fetch all projects for the authenticated user
 */
export const GET = createCORSHandler(async (req: NextRequest) => {
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

    // Rate limiting
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(userId, clientIp);
    const rateLimitResult = await checkRateLimit({
      ...RATE_LIMITS.API_READ,
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
            "X-RateLimit-Limit": RATE_LIMITS.API_READ.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    // 2. Fetch projects from database with their pipeline state
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
        projectContexts: {
          select: {
            projectId: true,
            currentPhase: true,
          },
        },
      },
    });

    // Get failure status for each project by checking AgentExecution
    const projectIds = conversations
      .map((c) => c.projectContexts?.[0]?.projectId)
      .filter(Boolean) as string[];

    const failedProjects = new Set<string>();
    if (projectIds.length > 0) {
      const failedExecutions = await prisma.agentExecution.findMany({
        where: {
          projectId: { in: projectIds },
          success: false,
        },
        select: {
          projectId: true,
        },
        distinct: ["projectId"],
      });

      failedExecutions.forEach((exec) => failedProjects.add(exec.projectId));
    }

    // Transform conversations to project format with accurate status
    const projects = conversations.map((conv) => {
      const projectContext = conv.projectContexts?.[0];
      const currentPhase = projectContext?.currentPhase || "analysis";
      const projectId = projectContext?.projectId;
      const hasFailed = projectId ? failedProjects.has(projectId) : false;

      // Map phase to status
      let status: "initializing" | "planning" | "executing" | "quality_check" | "deploying" | "completed" | "failed";
      let progress: number;

      if (hasFailed) {
        status = "failed";
        progress = 0; // Failed projects have no progress
      } else {
        switch (currentPhase) {
          case "analysis":
          case "research":
          case "validation":
            status = "planning";
            progress = 20;
            break;
          case "planning":
            status = "planning";
            progress = 30;
            break;
          case "execution":
            status = "executing";
            progress = 60;
            break;
          case "quality_check":
            status = "quality_check";
            progress = 80;
            break;
          case "deployment":
            status = "deploying";
            progress = 90;
            break;
          case "completed":
            status = "completed";
            progress = 100;
            break;
          default:
            status = "initializing";
            progress = 10;
        }
      }

      return {
        id: conv.id,
        name: conv.title || "Untitled Project",
        description: undefined,
        status,
        progress,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
      };
    });

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
}, AUTHENTICATED_API_CORS);
