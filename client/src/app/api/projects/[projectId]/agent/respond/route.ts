// src/app/api/projects/[projectId]/agent/respond/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";

// Zod schema for the expected request body
// Expects an object where keys are question IDs and values are user answers
const respondRequestSchema = z.object({
  answers: z.record(z.string().min(1), z.string().min(1)), // e.g., { "stack_choice": "Next.js", "auth_needs": "Google Only" }
});

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { projectId } = params;

    // Fetch the project, ensure it belongs to the user, and check its current status
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { agentStatus: true, agentClarificationQuestions: true }, // Select needed fields
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }

    // Ensure the agent is actually waiting for input
    if (project.agentStatus !== "PENDING_USER_INPUT") {
      return NextResponse.json(
        {
          error: `Agent is not waiting for input (current status: ${project.agentStatus})`,
        },
        { status: 400 }
      );
    }

    // 2. --- Input Validation ---
    const body = await req.json();
    const validation = respondRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request body format for answers",
          issues: validation.error.format(),
        },
        { status: 400 }
      );
    }
    const { answers } = validation.data;

    // Optional: Validate that the provided answer IDs match the questions asked
    const questionsAsked = (
      (project.agentClarificationQuestions as any[]) || []
    ).map((q) => q.id);
    const answerKeys = Object.keys(answers);
    if (
      answerKeys.length !== questionsAsked.length ||
      !answerKeys.every((key) => questionsAsked.includes(key))
    ) {
      logger.warn(
        `[Agent Respond] Mismatch between questions asked and answers provided for ${projectId}`
      );
      // Decide if this should be a hard error or just a warning
      // return NextResponse.json({ error: "Mismatch between questions asked and answers provided." }, { status: 400 });
    }

    // 3. --- Save User Responses ---
    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        agentUserResponses: answers as any, // Store the validated answers object
        agentStatus: "READY_TO_EXECUTE", // Update status: Ready to start building!
        agentClarificationQuestions: Prisma.JsonNull, // Clear the questions once answered
      },
    });

    logger.info(
      `[Agent Respond] User answers saved for project ${projectId}. Status updated to READY_TO_EXECUTE.`
    );

    // 4. --- Return Success ---
    // The frontend can now either automatically trigger the first execution step
    // or show a "Start Building" button.
    return NextResponse.json(
      {
        message: "Answers received. Agent is ready to start building.",
        agentStatus: "READY_TO_EXECUTE",
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`[Agent Respond API] Error: ${errorMessage}`, error);
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
