// src/app/api/projects/[projectId]/reviews/route.ts
/**
 * Human Review API - List and Create
 * Manage escalated issues that need human attention
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { sendReviewNotification } from "@/lib/notifications/notification-service";
import { toLogContext } from "@/lib/error-utils";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

const criticalIssueSchema = z.union([
  z.string(),
  z.object({
    description: z.string().optional(),
    severity: z.string().optional(),
    type: z.string().optional(),
  }).passthrough(),
]);

const createReviewSchema = z.object({
  waveNumber: z.number().int().positive(),
  reason: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["critical", "high", "medium"]).default("high"),
  criticalIssues: z.array(criticalIssueSchema),
  attempts: z.number().int().positive(),
});

/**
 * GET /api/projects/[projectId]/reviews
 * Get all review requests for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/reviews`,
    method: "GET",
  });

  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
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

    // 2. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: { userId: true },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 3. Get query parameters
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const priority = searchParams.get("priority") || undefined;

    // 4. Fetch review requests
    const reviews = await prisma.humanReviewRequest.findMany({
      where: {
        projectId: projectId,
        ...(status && { status }),
        ...(priority && { priority }),
      },
      orderBy: [
        { priority: "asc" }, // critical first
        { createdAt: "desc" }, // newest first
      ],
      // include: {
      //   _count: {
      //     select: {
      //       // If you add comments model later
      //     },
      //   },
      // },
    });

    logger.info("Review requests retrieved", {
      projectId: projectId,
      count: reviews.length,
    });

    return NextResponse.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        waveNumber: r.waveNumber,
        reason: r.reason,
        description: r.description,
        priority: r.priority,
        status: r.status,
        attempts: r.attempts,
        criticalIssuesCount: Array.isArray(r.criticalIssues)
          ? r.criticalIssues.length
          : 0,
        assignedTo: r.assignedTo,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        notificationSent: r.notificationSent,
      })),
      summary: {
        total: reviews.length,
        pending: reviews.filter((r) => r.status === "pending").length,
        inReview: reviews.filter((r) => r.status === "in_review").length,
        resolved: reviews.filter((r) => r.status === "resolved").length,
      },
    });
  } catch (error) {
    logger.error("Get reviews error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[projectId]/reviews
 * Create a new review request (usually called by system)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/reviews`,
    method: "POST",
  });

  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Validate request
    const body: unknown = await req.json();
    const validatedBody = createReviewSchema.parse(body);

    // 3. Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: projectId },
      select: { userId: true },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 4. Check if review already exists for this wave
    const existingReview = await prisma.humanReviewRequest.findUnique({
      where: {
        projectId_waveNumber: {
          projectId: projectId,
          waveNumber: validatedBody.waveNumber,
        },
      },
    });

    if (existingReview) {
      return NextResponse.json(
        {
          error: "Review request already exists for this wave",
          reviewId: existingReview.id,
        },
        { status: 409 }
      );
    }

    // 5. Create review request
    const review = await prisma.humanReviewRequest.create({
      data: {
        projectId: projectId,
        waveNumber: validatedBody.waveNumber,
        reason: validatedBody.reason,
        description: validatedBody.description,
        priority: validatedBody.priority,
        criticalIssues: validatedBody.criticalIssues as Prisma.InputJsonValue,
        attempts: validatedBody.attempts,
        status: "pending",
      },
    });

    logger.info("Review request created", {
      reviewId: review.id,
      projectId: projectId,
      waveNumber: validatedBody.waveNumber,
      priority: validatedBody.priority,
    });

    // 6. Send notification
    try {
      await sendReviewNotification({
        userId,
        reviewId: review.id,
        projectId: projectId,
        waveNumber: validatedBody.waveNumber,
        priority: validatedBody.priority,
        reason: validatedBody.reason,
      });

      // Mark notification as sent
      await prisma.humanReviewRequest.update({
        where: { id: review.id },
        data: {
          notificationSent: true,
          notificationSentAt: new Date(),
        },
      });
    } catch (notifError) {
      logger.warn("Failed to send review notification", toLogContext(notifError));
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      review: {
        id: review.id,
        waveNumber: review.waveNumber,
        priority: review.priority,
        status: review.status,
        createdAt: review.createdAt,
      },
      message: "Review request created successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Create review error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
