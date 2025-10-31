// src/app/api/projects/[projectId]/agent/plan/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { logger } from "@/lib/logger";

const aiPlanResponseSchema = z.object({
  plan: z
    .array(z.object({ task: z.string().min(1) }))
    .min(1, "Plan must contain at least one task."),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        options: z.array(z.string()).optional(),
        allowAgentDecision: z.boolean().optional().default(false),
      })
    )
    .optional()
    .default([]),
  requiredEnvKeys: z
    .array(
      z
        .string()
        .min(1)
        .regex(/^[A-Z0-9_]+$/, "Invalid ENV key format")
    )
    .optional()
    .default([]),
});
type AIPlanResponse = z.infer<typeof aiPlanResponseSchema>;

/**
 * Extracts a JSON object from a string, stripping markdown fences (```json ... ```)
 * if they are present.
 */
function extractJsonFromString(text: string): string {
  const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = text.match(jsonRegex);
  if (match && match[1]) {
    // Found markdown fences, return the clean JSON content
    return match[1];
  }
  // No fences found, assume the whole string is the JSON
  return text;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> } // *** CORRECTED SIGNATURE ***
) {
  const log = logger.child({ api: "/api/projects/[projectId]/agent/plan" });
  try {
    const { projectId } = await params; // *** CORRECTED PARAM ACCESS ***
    log.info(`Plan generation request for project ${projectId}`);

    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized access attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    log.info(`Authenticated user: ${userId}`);

    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      include: {
        conversation: {
          include: {
            messages: {
              // Look for the first AI-generated message
              where: { role: { in: ["assistant", "model"] } },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!project) {
      log.warn(`Project ${projectId} not found or forbidden.`);
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }

    const blueprintContent = project.conversation?.messages?.[0]?.content;

    if (!blueprintContent) {
      log.error(
        `Blueprint content missing for project ${projectId}. Searched messages for role 'assistant' or 'model'.`
      );
      return NextResponse.json(
        {
          error:
            "Blueprint not found for this project. Please generate a blueprint first.",
        },
        { status: 400 }
      );
    }

    const planningPrompt = `
You are an AI Engineering Lead analyzing a startup blueprint to create a technical build plan. Your goals are:

1.  **Analyze Blueprint:** Understand the core features, target users, and implied technical needs (database, auth, payments, external APIs, etc.).
2.  **Create Build Plan:** Generate a concise, step-by-step technical plan (5-10 steps) for building the MVP. Focus on backend setup (framework, DB schema), auth, core features, and essential frontend components. Assume a standard Next.js + Prisma setup unless otherwise implied or specified.
3.  **Identify Required ENV Keys:** List the environment variable keys essential for the project based on the plan (e.g., DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, STRIPE_SECRET_KEY, RESEND_API_KEY). Be specific. ALWAYS include DATABASE_URL and NEXTAUTH_SECRET if auth is involved.
4.  **Formulate Clarifying Questions:** Identify 1-3 critical ambiguities or technical decisions needed from the user.
    * **Tech Choices:** If the stack is ambiguous (e.g., UI library, specific payment provider if multiple mentioned), formulate a question with clear options. Include a common default. Mark these questions with \`"allowAgentDecision": true\`.
    * **Feature Focus:** Ask about core feature prioritization if unclear.
    * **Assign unique IDs** (e.g., "ui_library", "payment_provider").
5.  **If no questions or ENV keys are needed, return empty arrays.**

**Blueprint:**
---
${blueprintContent}
---

**Response Format:** Respond ONLY with a valid JSON object matching this structure:
\`\`\`json
{
  "plan": [
    { "task": "Step 1 description (e.g., Setup Next.js project with Tailwind CSS)" },
    { "task": "Step 2 description (e.g., Define Prisma schema: User, Project models)" }
  ],
  "questions": [
    {
      "id": "ui_library",
      "text": "Which UI component library should we use?",
      "options": ["Tailwind CSS (Default)", "Shadcn UI", "Material UI"],
      "allowAgentDecision": true
    }
  ],
  "requiredEnvKeys": [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET"
  ]
}
\`\`\`
Ensure the JSON is perfectly valid. "plan" must have at least one task. "questions" and "requiredEnvKeys" can be empty arrays [].
`;

    log.info(
      `Requesting enhanced plan generation from AI for project ${projectId}`
    );
    const aiResponseString = await executeAITaskSimple(
      AITaskType.AGENT_PLANNING,
      {
        prompt: planningPrompt,
        responseFormat: { type: "json_object" },
      }
    );

    let parsedResponse: AIPlanResponse;
    try {
      // *** THIS IS THE FIX ***
      // 1. Clean the string to remove markdown fences
      const cleanedJsonString = extractJsonFromString(aiResponseString);

      // 2. Parse the clean string
      const rawJsonResponse = JSON.parse(cleanedJsonString) as unknown;
      // *** END FIX ***

      parsedResponse = aiPlanResponseSchema.parse(rawJsonResponse);
      log.info(
        `AI response parsed successfully. Plan steps: ${parsedResponse.plan.length}, Questions: ${parsedResponse.questions.length}, EnvKeys: ${parsedResponse.requiredEnvKeys.length}`
      );
    } catch (parseError) {
      log.error(
        `Failed to parse or validate AI JSON response for ${projectId}:`,
        parseError instanceof Error ? parseError : undefined
      );
      log.error(`Raw AI Response (that failed parsing): ${aiResponseString}`); // Log the raw, problematic string
      return NextResponse.json(
        {
          error:
            "AI failed to generate a valid plan structure. Please try again.",
        },
        { status: 500 }
      );
    }

    const { plan, questions, requiredEnvKeys } = parsedResponse;
    let nextAgentStatus: string;

    if (questions.length > 0) {
      nextAgentStatus = "PENDING_USER_INPUT";
    } else if (requiredEnvKeys.length > 0) {
      nextAgentStatus = "PENDING_CONFIGURATION";
    } else {
      nextAgentStatus = "READY_TO_EXECUTE";
    }
    log.info(`Determined next agent status: ${nextAgentStatus}`);

    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        agentPlan: plan,
        agentClarificationQuestions: questions,
        agentRequiredEnvKeys: requiredEnvKeys,
        agentUserResponses: Prisma.JsonNull,
        agentCurrentStep: 0,
        agentStatus: nextAgentStatus,
        agentExecutionHistory: Prisma.JsonNull,
      },
    });

    log.info(
      `Plan generated and saved for project ${projectId}. Status: ${nextAgentStatus}`
    );

    return NextResponse.json(
      {
        plan: plan,
        questions: questions,
        requiredEnvKeys: requiredEnvKeys,
        agentStatus: nextAgentStatus,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error during planning";
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
