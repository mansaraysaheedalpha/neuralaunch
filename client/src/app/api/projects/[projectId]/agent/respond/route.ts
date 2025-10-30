// src/app/api/projects/[projectId]/agent/respond/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";

// Zod schema for the expected request body
// Expects an object where keys are question IDs and values are user answers
// Allows for a special value "__AGENT_DECISION__" for questions where the agent can decide.
const respondRequestSchema = z.object({
  answers: z.record(z.string().min(1), z.string()), // Allow empty string for agent decision marker? Let's use a specific marker.
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const log = logger.child({ api: "/api/projects/[projectId]/agent/respond" });
  try {
    const params = await context.params;
    const { projectId } = params;
    log.info(`Received user responses for project ${projectId}`);

    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized access attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    log.info(`Authenticated user: ${userId}`);

    // 2. --- Fetch Project State ---
    // Get current status, questions, and REQUIRED ENV KEYS
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: {
        agentStatus: true,
        agentClarificationQuestions: true,
        agentRequiredEnvKeys: true, // Fetch the list of required keys
      },
    });

    if (!project) {
      log.warn(`Project ${projectId} not found or forbidden.`);
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }

    // Ensure the agent is actually waiting for input
    if (project.agentStatus !== "PENDING_USER_INPUT") {
      log.warn(
        `Agent not in PENDING_USER_INPUT status (current: ${project.agentStatus}).`
      );
      return NextResponse.json(
        {
          error: `Agent is not waiting for input (current status: ${project.agentStatus})`,
        },
        { status: 400 }
      );
    }

    // 3. --- Input Validation ---
    const body: unknown = await req.json();
    const validation = respondRequestSchema.safeParse(body);

    if (!validation.success) {
      log.error(
        "Invalid request body format for answers.",
        undefined,
        { issues: validation.error.format() }
      );
      return NextResponse.json(
        {
          error: "Invalid request body format for answers",
          issues: validation.error.format(),
        },
        { status: 400 }
      );
    }
    const { answers } = validation.data;

    // Optional: Validate answers against questions asked (more robust)
    type ClarificationQuestion = { id: string; allowAgentDecision?: boolean | null };
    const isClarificationQuestion = (q: unknown): q is ClarificationQuestion => {
      if (typeof q !== "object" || q === null) return false;
      const maybe = q as { id?: unknown; allowAgentDecision?: unknown };
      return typeof maybe.id === "string";
    };
    const rawQuestions = project.agentClarificationQuestions as unknown;
    const clarificationQuestions: ClarificationQuestion[] = Array.isArray(rawQuestions)
      ? rawQuestions.filter(isClarificationQuestion)
      : [];
    const questionsAsked = clarificationQuestions.map((q) => q.id);
    const providedAnswerKeys = Object.keys(answers);

    if (!providedAnswerKeys.every((key) => questionsAsked.includes(key))) {
      log.warn(`Mismatch or extra answers provided for project ${projectId}`);
      // Consider if this should be a hard error or just a warning
      // For now, we'll proceed but log it.
    }
    // Ensure all non-agent-decision questions got a real answer
    const requiredAnswers = clarificationQuestions
      .filter((q) => !q.allowAgentDecision)
      .map((q) => q.id);

    if (
      !requiredAnswers.every(
        (qid) => answers[qid] && answers[qid] !== "__AGENT_DECISION__"
      )
    ) {
      log.error(`Missing required answers for project ${projectId}`);
      return NextResponse.json(
        { error: "Please provide answers for all required questions." },
        { status: 400 }
      );
    }

    // 4. --- Determine Next Status ---
    const requiredEnvKeys =
      (project.agentRequiredEnvKeys as string[] | null) || [];
    const nextAgentStatus =
      requiredEnvKeys.length > 0
        ? "PENDING_CONFIGURATION" // Needs ENV vars next
        : "READY_TO_EXECUTE"; // Ready to build

    log.info(`Determined next agent status: ${nextAgentStatus}`);

    // 5. --- Save User Responses & Update Status ---
    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        agentUserResponses: answers as Prisma.InputJsonValue, // Store the validated answers object
        agentStatus: nextAgentStatus,
        agentClarificationQuestions: Prisma.JsonNull, // Clear the questions once answered
      },
    });

    log.info(
      `User answers saved for project ${projectId}. Status updated to ${nextAgentStatus}.`
    );

    // 6. --- Return Success ---
    return NextResponse.json(
      {
        message:
          nextAgentStatus === "PENDING_CONFIGURATION"
            ? "Answers received. Please configure required environment variables."
            : "Answers received. Agent is ready to start building.",
        agentStatus: nextAgentStatus,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error processing responses";
    log.error(
      `Error: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
