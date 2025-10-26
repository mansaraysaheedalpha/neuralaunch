// src/app/api/validation/[conversationId]/route.ts

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getFeedbackSentiment, getValidationInsight } from "@/lib/validation";
import { saveMemory } from "@/lib/ai-memory";
import { handleApiError, ErrorResponses, NotFoundError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";

// --- Zod Schema for Input Validation ---
const updateSchema = z.object({
  customerInterviewCount: z.number().int().min(0).max(1000),
  interviewNotes: z.string().min(10, "Notes must be at least 10 characters"),
});

const conversationIdSchema = z.object({
  conversationId: z.string().cuid(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const rawParams = await params;
    const validation = conversationIdSchema.safeParse(rawParams);
    if (!validation.success) {
      return ErrorResponses.badRequest("Invalid conversation ID");
    }
    
    const { conversationId } = validation.data;

    // Verify user owns the conversation
    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundError("Conversation");
    }

    // Upsert ensures that a ValidationHub entry always exists
    const validationHub = await prisma.validationHub.upsert({
      where: { conversationId },
      create: {
        conversationId,
      },
      update: {}, // No updates needed on a simple GET
    });

    return successResponse(validationHub);
  } catch (error) {
    return handleApiError(error, "GET /api/validation/[conversationId]");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const userId = session.user.id;
    const rawParams = await params;
    const paramValidation = conversationIdSchema.safeParse(rawParams);
    if (!paramValidation.success) {
      return ErrorResponses.badRequest("Invalid conversation ID");
    }
    
    const { conversationId } = paramValidation.data;
    const body: unknown = await req.json();

    // 1. Validate Input
    const validation = updateSchema.safeParse(body);
    if (!validation.success) {
      return handleApiError(validation.error, "POST /api/validation/[conversationId]");
    }
    const { customerInterviewCount, interviewNotes } = validation.data;

    // 2. Fetch All Required Data in Parallel
    const [landingPageData, sprintData, conversation] = await Promise.all([
      // Get landing page analytics
      prisma.landingPage.findUnique({
        where: { conversationId },
        select: {
          _count: {
            select: { pageViews: true, emailSignups: true },
          },
        },
      }),
      // Get sprint progress
      prisma.sprint.findUnique({
        where: { conversationId },
        select: { totalTasks: true, completedTasks: true },
      }),
      // Get conversation to check ownership
      prisma.conversation.findUnique({
        where: { id: conversationId, userId: session.user.id },
        select: { id: true },
      }),
    ]);

    // Check if user owns this conversation
    if (!conversation) {
      throw new NotFoundError("Conversation");
    }

    // 3. Call AI for Sentiment Analysis
    const feedbackSentimentScore = await getFeedbackSentiment(interviewNotes);

    // 4. --- RUN THE VALIDATION ALGORITHM ---

    // A. Market Demand Score (Max: 40 pts)
    const views = landingPageData?._count.pageViews ?? 0;
    const signups = landingPageData?._count.emailSignups ?? 0;
    const conversionRate = views > 0 ? signups / views : 0;
    // Normalize against a "world-class" 10% conversion rate
    const marketDemandScore = Math.min(40, (conversionRate / 0.1) * 40);

    // B. Problem Validation Score (Max: 50 pts)
    // b1. Interview Effort (Max: 15 pts) - Gamify aiming for 10 interviews
    const interviewCountScore = Math.min(
      15,
      (customerInterviewCount / 10) * 15
    );
    // b2. Feedback Sentiment (Max: 35 pts)
    const sentimentScore = feedbackSentimentScore * 35;
    const problemValidationScore = interviewCountScore + sentimentScore;

    // C. Execution Score (Max: 10 pts)
    const totalTasks = sprintData?.totalTasks ?? 0;
    const completedTasks = sprintData?.completedTasks ?? 0;
    const completionPercentage =
      totalTasks > 0 ? completedTasks / totalTasks : 0;
    const executionScore = completionPercentage * 10;

    // D. Total Score (Max: 100 pts)
    const totalValidationScore =
      marketDemandScore + problemValidationScore + executionScore;
      
    // 5. --- GET THE AI INSIGHT ---
    const aiInsight = await getValidationInsight({
      marketDemandScore,
      problemValidationScore,
      executionScore,
      totalValidationScore,
    });

    void saveMemory({
      content: `Validation Insight (Score: ${totalValidationScore.toFixed(0)}): "${aiInsight}"`,
      conversationId,
      userId,
    });

    // 6. Save Results to Database
    const validationHub = await prisma.validationHub.upsert({
      where: { conversationId },
      create: {
        conversationId,
        customerInterviewCount,
        interviewNotes,
        feedbackSentimentScore,
        marketDemandScore,
        problemValidationScore,
        executionScore,
        totalValidationScore,
        aiInsight,
      },
      update: {
        customerInterviewCount,
        interviewNotes,
        feedbackSentimentScore,
        marketDemandScore,
        problemValidationScore,
        executionScore,
        totalValidationScore,
        aiInsight,
        updatedAt: new Date(),
      },
    });

    // 7. Return the Full Result
    return successResponse(validationHub);
  } catch (error) {
    return handleApiError(error, "POST /api/validation/[conversationId]");
  }
}
