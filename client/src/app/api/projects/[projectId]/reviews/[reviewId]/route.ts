// src/app/api/projects/[projectId]/reviews/[reviewId]/route.ts
/**
 * Human Review API - Individual Review Operations
 * Get, update, and resolve specific review requests
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { inngest } from "@/inngest/client";

const updateReviewSchema = z.object({
  status: z.enum(["pending", "in_review", "resolved", "cancelled"]).optional(),
  assignedTo: z.string().optional().nullable(),
  resolution: z.string().optional(),
  resolverNotes: z.string().optional(),
});

/**
 * GET /api/projects/[projectId]/reviews/[reviewId]
 * Get detailed review information
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string; reviewId: string } }
) {
  const logger = createApiLogger({
    path: `/api/projects/${params.projectId}/reviews/${params.reviewId}`,
    method: "GET",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: params.projectId },
      select: { userId: true },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get review
    const review = await prisma.humanReviewRequest.findUnique({
      where: { id: params.reviewId },
    });

    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (review.projectId !== params.projectId) {
      return NextResponse.json(
        { error: "Review does not belong to this project" },
        { status: 400 }
      );
    }

    // Get wave details
    const wave = await prisma.executionWave.findUnique({
      where: {
        projectId_waveNumber: {
          projectId: params.projectId,
          waveNumber: review.waveNumber,
        },
      },
    });

    // Get tasks in the wave
    const tasks = await prisma.agentTask.findMany({
      where: {
        projectId: params.projectId,
        waveNumber: review.waveNumber,
      },
      select: {
        id: true,
        agentName: true,
        status: true,
        reviewScore: true,
        criticalIssues: true,
        prUrl: true,
        fixAttempts: true,
        remainingIssues: true,
      },
    });

    logger.info("Review details retrieved", {
      reviewId: params.reviewId,
      status: review.status,
    });

    return NextResponse.json({
      review: {
        id: review.id,
        projectId: review.projectId,
        waveNumber: review.waveNumber,
        reason: review.reason,
        description: review.description,
        priority: review.priority,
        status: review.status,
        attempts: review.attempts,
        criticalIssues: review.criticalIssues,
        assignedTo: review.assignedTo,
        resolution: review.resolution,
        resolverNotes: review.resolverNotes,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        resolvedAt: review.resolvedAt,
      },
      wave: wave
        ? {
            waveNumber: wave.waveNumber,
            status: wave.status,
            taskCount: wave.taskCount,
            completedCount: wave.completedCount,
            failedCount: wave.failedCount,
            fixAttempts: wave.fixAttempts,
          }
        : null,
      tasks: tasks.map((t) => ({
        id: t.id,
        agentName: t.agentName,
        status: t.status,
        reviewScore: t.reviewScore,
        criticalIssues: t.criticalIssues,
        prUrl: t.prUrl,
        fixAttempts: t.fixAttempts,
        remainingIssues: t.remainingIssues,
      })),
    });
  } catch (error) {
    logger.error("Get review details error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[projectId]/reviews/[reviewId]
 * Update review status, assign, or add notes
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string; reviewId: string } }
) {
  const logger = createApiLogger({
    path: `/api/projects/${params.projectId}/reviews/${params.reviewId}`,
    method: "PATCH",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Validate request
    const body = await req.json();
    const validatedBody = updateReviewSchema.parse(body);

    // Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: params.projectId },
      select: { userId: true },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get existing review
    const existingReview = await prisma.humanReviewRequest.findUnique({
      where: { id: params.reviewId },
    });

    if (!existingReview) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (existingReview.projectId !== params.projectId) {
      return NextResponse.json(
        { error: "Review does not belong to this project" },
        { status: 400 }
      );
    }

    // Update review
    const updatedReview = await prisma.humanReviewRequest.update({
      where: { id: params.reviewId },
      data: {
        ...validatedBody,
        updatedAt: new Date(),
        ...(validatedBody.status === "resolved" && {
          resolvedAt: new Date(),
        }),
      },
    });

    logger.info("Review updated", {
      reviewId: params.reviewId,
      status: updatedReview.status,
      assignedTo: updatedReview.assignedTo,
    });

    return NextResponse.json({
      success: true,
      review: {
        id: updatedReview.id,
        status: updatedReview.status,
        assignedTo: updatedReview.assignedTo,
        updatedAt: updatedReview.updatedAt,
        resolvedAt: updatedReview.resolvedAt,
      },
      message: "Review updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.errors });
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Update review error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[projectId]/reviews/[reviewId]
 * Cancel/delete a review request
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; reviewId: string } }
) {
  const logger = createApiLogger({
    path: `/api/projects/${params.projectId}/reviews/${params.reviewId}`,
    method: "DELETE",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Verify project ownership
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId: params.projectId },
      select: { userId: true },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (projectContext.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check review exists
    const review = await prisma.humanReviewRequest.findUnique({
      where: { id: params.reviewId },
    });

    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (review.projectId !== params.projectId) {
      return NextResponse.json(
        { error: "Review does not belong to this project" },
        { status: 400 }
      );
    }

    // Soft delete by marking as cancelled
    await prisma.humanReviewRequest.update({
      where: { id: params.reviewId },
      data: {
        status: "cancelled",
        updatedAt: new Date(),
      },
    });

    logger.info("Review cancelled", {
      reviewId: params.reviewId,
    });

    return NextResponse.json({
      success: true,
      message: "Review request cancelled",
    });
  } catch (error) {
    logger.error("Delete review error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
