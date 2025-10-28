// src/app/api/projects/[projectId]/agent/plan/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

// Define the expected shape of the AI response with proper Zod schemas
const aiPlanResponseSchema = z.object({
  plan: z
    .array(
      z.object({
        task: z.string().min(1),
      })
    )
    .min(1),
  questions: z
    .array(
      z.object({
        id: z.string().min(1), // A unique ID for the question (e.g., "stack_choice")
        text: z.string().min(1),
      })
    )
    .optional()
    .default([]), // Questions are optional
});

type AIPlanResponse = z.infer<typeof aiPlanResponseSchema>;

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
): Promise<NextResponse> {
  try {
    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { projectId } = params;

    // Fetch the project (LandingPage) and ensure it belongs to the user
    // Also include the conversation to get the blueprint
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      include: {
        conversation: {
          include: {
            messages: {
              where: { role: "assistant" }, // Assuming 'assistant' role for AI blueprint
              orderBy: { createdAt: "asc" },
              take: 1, // Get the first AI message which should be the blueprint
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }
    if (!project.conversation || project.conversation.messages.length === 0) {
      return NextResponse.json(
        { error: "Blueprint not found for this project" },
        { status: 400 }
      );
    }

    const blueprintContent = project.conversation.messages[0].content;

    // 2. --- Construct AI Prompt ---
    const planningPrompt = `
You are an AI Engineering Lead tasked with building a web application based on the provided blueprint. Your goals are:
1.  Analyze the blueprint and create a concise, step-by-step technical plan (5-10 steps) outlining the major features/tasks involved in building the MVP. Focus on backend setup, authentication, core models, and essential frontend components.
2.  Identify 1-3 critical ambiguities or decisions required from the user before starting implementation (e.g., stack choice if unclear, primary feature focus, specific integrations). Generate clear, non-technical questions for the user. If the blueprint is very clear, you might not need any questions.
3.  Assign a unique, simple 'id' (e.g., "tech_stack", "auth_needs") to each question.

**Blueprint:**
---
${blueprintContent}
---

**Response Format:** Respond ONLY with a valid JSON object matching this structure:
\`\`\`json
{
  "plan": [
    { "task": "Describe Step 1 (e.g., Setup Prisma schema with User, Post models)" },
    { "task": "Describe Step 2 (e.g., Implement Google OAuth using NextAuth)" },
    // ... more steps
  ],
  "questions": [
    { "id": "question1_id", "text": "Ask question 1 here" },
    { "id": "question2_id", "text": "Ask question 2 here" }
    // ... potentially more, up to 3
  ]
}
\`\`\`
Ensure the JSON is perfectly valid. The "plan" array must contain at least one task. The "questions" array can be empty if no clarification is needed.`;

    // 3. --- Call AI Orchestrator ---
    logger.info(
      `[Agent Plan] Requesting plan generation for project ${projectId}`
    );
    const aiResponseJson = await executeAITaskSimple(
      AITaskType.AGENT_PLANNING,
      {
        // Assuming you add AGENT_PLANNING type
        prompt: planningPrompt,
        responseFormat: { type: "json_object" }, // Crucial for getting JSON back
      }
    );

    // 4. --- Parse and Validate AI Response ---
    let parsedResponse: AIPlanResponse;
    try {
      const rawJsonResponse = JSON.parse(aiResponseJson);
      parsedResponse = aiPlanResponseSchema.parse(rawJsonResponse); // Validate against Zod schema
    } catch (parseError) {
      logger.error(
        `[Agent Plan] Failed to parse or validate AI JSON response for ${projectId}:`,
        parseError
      );
      logger.error(`[Agent Plan] Raw AI Response: ${aiResponseJson}`);
      return NextResponse.json(
        { error: "AI failed to generate a valid plan. Please try again." },
        { status: 500 }
      );
    }

    // 5. --- Save Plan & Questions to Database ---
    const { plan, questions } = parsedResponse;

    const nextAgentStatus =
      questions.length > 0 ? "PENDING_USER_INPUT" : "READY_TO_EXECUTE";

    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        agentPlan: plan as Prisma.JsonArray, // Type-safe cast to JsonArray
        agentClarificationQuestions: questions as Prisma.JsonArray,
        agentUserResponses: Prisma.JsonNull, // Clear previous responses
        agentCurrentStep: 0, // Start at the first step
        agentStatus: nextAgentStatus,
      },
    });

    logger.info(
      `[Agent Plan] Plan generated and saved for project ${projectId}. Status: ${nextAgentStatus}`
    );

    // 6. --- Return Questions to Frontend ---
    // The frontend will receive these questions and display them in the chat UI.
    return NextResponse.json(
      {
        questions: questions,
        plan: plan, // Also return the plan for display if needed
        agentStatus: nextAgentStatus,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorToLog = error instanceof Error ? error : new Error(String(error));
    logger.error(
      `[Agent Plan API] Error: ${errorMessage}`,
      errorToLog
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}