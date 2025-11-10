// src/app/api/projects/[projectId]/reviews/[reviewId]/actions/route.ts
/**
 * Review Actions API
 * Special actions like: approve, reject, request-changes, retry
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { inngest } from "@/inngest/client";

const reviewActionSchema = z.object({
  action: z.enum(["approve", "reject", "request_changes", "retry_autofix"]),
  notes: z.string().optional(),
  conversationId: z.string().min(1),
});

/**
 * POST /api/projects/[projectId]/reviews/[reviewId]/actions
 * Perform actions on a review
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string, reviewId: string }> }
) {
  const { projectId, reviewId } = await params;

  const logger = createApiLogger({
    path: `/api/projects/${projectId}/reviews/${reviewId}/actions`,
    method: "POST",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Validate request
    const body = await req.json();
    const validatedBody = reviewActionSchema.parse(body);

    // Verify project ownership
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

    // Get review
    const review = await prisma.humanReviewRequest.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (review.projectId !== projectId) {
      return NextResponse.json(
        { error: "Review does not belong to this project" },
        { status: 400 }
      );
    }

    // Handle action
    switch (validatedBody.action) {
      case "approve":
        // Mark as resolved and continue to next wave
        await prisma.humanReviewRequest.update({
          where: { id: reviewId },
          data: {
            status: "resolved",
            resolution: "approved_by_human",
            resolverNotes: validatedBody.notes || "Approved by user",
            resolvedAt: new Date(),
          },
        });

        // Update wave status
        await prisma.executionWave.update({
          where: {
            projectId_waveNumber: {
              projectId: projectId,
              waveNumber: review.waveNumber,
            },
          },
          data: {
            status: "completed",
            escalatedToHuman: false,
          },
        });

        // Update project context
        await prisma.projectContext.update({
          where: { projectId: projectId },
          data: {
            humanReviewRequired: false,
          },
        });

        // Trigger next wave
        const pendingTasksCount = await prisma.agentTask.count({
          where: {
            projectId: projectId,
            status: "pending",
            waveNumber: null,
          },
        });

        if (pendingTasksCount > 0) {
          await inngest.send({
            name: "agent/wave.start",
            data: {
              projectId: projectId,
              userId,
              conversationId: validatedBody.conversationId,
              waveNumber: review.waveNumber + 1,
            },
          });
        }

        logger.info("Review approved, continuing execution", {
          reviewId: reviewId,
          nextWave: review.waveNumber + 1,
        });

        return NextResponse.json({
          success: true,
          action: "approved",
          message: "Review approved. Continuing to next wave.",
          nextWave: pendingTasksCount > 0 ? review.waveNumber + 1 : null,
        });

      case "reject":
        // Mark as resolved but stop execution
        await prisma.humanReviewRequest.update({
          where: { id: reviewId },
          data: {
            status: "resolved",
            resolution: "rejected_by_human",
            resolverNotes: validatedBody.notes || "Rejected by user",
            resolvedAt: new Date(),
          },
        });

        // Update wave status
        await prisma.executionWave.update({
          where: {
            projectId_waveNumber: {
              projectId: projectId,
              waveNumber: review.waveNumber,
            },
          },
          data: {
            status: "failed",
          },
        });

        logger.info("Review rejected", {
          reviewId: reviewId,
        });

        return NextResponse.json({
          success: true,
          action: "rejected",
          message: "Review rejected. Wave execution stopped.",
        });

      case "request_changes":
        // Keep review open, expecting manual fixes
        await prisma.humanReviewRequest.update({
          where: { id: reviewId },
          data: {
            status: "in_review",
            resolverNotes: validatedBody.notes || "Changes requested",
            updatedAt: new Date(),
          },
        });

        logger.info("Changes requested on review", {
          reviewId: reviewId,
        });

        return NextResponse.json({
          success: true,
          action: "request_changes",
          message: "Changes requested. Awaiting manual fixes.",
        });

      case "retry_autofix":
        // Retry auto-fix with higher attempt limit
        await prisma.humanReviewRequest.update({
          where: { id: reviewId },
          data: {
            status: "in_review",
            resolverNotes: (validatedBody.notes || "") + " - Retrying auto-fix",
            updatedAt: new Date(),
          },
        });

        // Trigger fix-issues function again with extended attempts
        await inngest.send({
          name: "agent/quality.fix-issues",
          data: {
            projectId: projectId,
            userId,
            conversationId: validatedBody.conversationId,
            waveNumber: review.waveNumber,
            issues: [], // Will be populated from review data
            attempt: 1,
            criticResult: {}, // Will be fetched from database
            maxRetries: 10, // Extended retry limit
          },
        });

        logger.info("Retrying auto-fix", {
          reviewId: reviewId,
          extendedRetries: 10,
        });

        return NextResponse.json({
          success: true,
          action: "retry_autofix",
          message: "Retrying auto-fix with extended attempts (10).",
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Review action error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
