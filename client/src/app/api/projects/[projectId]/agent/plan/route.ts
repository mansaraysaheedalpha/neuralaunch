// src/app/api/projects/[projectId]/agent/plan/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { logger } from "@/lib/logger";

// --- Enhanced AI Response Schema ---
// Now includes requiredEnvKeys
const aiPlanResponseSchema = z.object({
  plan: z
    .array(
      z.object({
        task: z.string().min(1),
      })
    )
    .min(1, "Plan must contain at least one task."),
  questions: z
    .array(
      z.object({
        id: z.string().min(1), // e.g., "tech_stack", "db_choice", "payment_provider"
        text: z.string().min(1),
        // NEW: Optional field for choices, useful for tech stack questions
        options: z.array(z.string()).optional(),
        // NEW: Indicate if user can let agent decide
        allowAgentDecision: z.boolean().optional().default(false),
      })
    )
    .optional()
    .default([]),
  // NEW: List of required environment variable keys
  requiredEnvKeys: z
    .array(
      z
        .string()
        .min(1)
        .regex(/^[A-Z0-9_]+$/, "Invalid ENV key format") // Basic format check
    )
    .optional()
    .default([]),
});
type AIPlanResponse = z.infer<typeof aiPlanResponseSchema>;

// --- API Route ---
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const log = logger.child({ api: "/api/projects/[projectId]/agent/plan" });
  try {
    const params = await context.params;
    const { projectId } = params;
    log.info(`Plan generation request for project ${projectId}`);

    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized access attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    log.info(`Authenticated user: ${userId}`);

    // 2. --- Fetch Project Blueprint ---
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      include: {
        conversation: {
          include: {
            messages: {
              where: { role: "assistant" }, // Assuming 'assistant' role holds the final blueprint
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
    if (!project.conversation?.messages?.[0]?.content) {
      log.error(`Blueprint content missing for project ${projectId}.`);
      return NextResponse.json(
        { error: "Blueprint not found for this project" },
        { status: 400 }
      );
    }
    const blueprintContent = project.conversation.messages[0].content;

    // 3. --- Construct Enhanced AI Prompt ---
    // This prompt now asks for env keys and considers tech choices
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
    // ... 5-10 steps total
  ],
  "questions": [
    {
      "id": "ui_library",
      "text": "Which UI component library should we use?",
      "options": ["Tailwind CSS (Default)", "Shadcn UI", "Material UI"],
      "allowAgentDecision": true
    },
    {
      "id": "payment_provider",
      "text": "The blueprint mentions payments. Which provider will you use?",
      "options": ["Stripe (Recommended)", "Lemon Squeezy", "Paddle"],
      "allowAgentDecision": false // User MUST provide keys later
    }
    // ... up to 3 questions
  ],
  "requiredEnvKeys": [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "STRIPE_SECRET_KEY", // Only if Stripe is implied/chosen
    "RESEND_API_KEY" // Only if email is implied/chosen
    // ... other keys based on analysis
  ]
}
\`\`\`
Ensure the JSON is perfectly valid. "plan" must have at least one task. "questions" and "requiredEnvKeys" can be empty arrays [].
`;

    // 4. --- Call AI Orchestrator ---
    log.info(
      `Requesting enhanced plan generation from AI for project ${projectId}`
    );
    const aiResponseJson = await executeAITaskSimple(
      AITaskType.AGENT_PLANNING, // Use the existing type, the prompt is enhanced
      {
        prompt: planningPrompt,
        responseFormat: { type: "json_object" }, // Request JSON output
      }
    );

    // 5. --- Parse and Validate AI Response ---
    let parsedResponse: AIPlanResponse;
    try {
      const rawJsonResponse = JSON.parse(aiResponseJson);
      parsedResponse = aiPlanResponseSchema.parse(rawJsonResponse); // Validate against updated Zod schema
      log.info(
        `AI response parsed successfully. Plan steps: ${parsedResponse.plan.length}, Questions: ${parsedResponse.questions.length}, EnvKeys: ${parsedResponse.requiredEnvKeys.length}`
      );
    } catch (parseError) {
      log.error(
        `Failed to parse or validate AI JSON response for ${projectId}:`,
        parseError instanceof Error ? parseError : undefined
      );
      log.error(`Raw AI Response: ${aiResponseJson}`); // Log raw response for debugging
      return NextResponse.json(
        {
          error:
            "AI failed to generate a valid plan structure. Please try again.",
        },
        { status: 500 }
      );
    }

    // 6. --- Determine Next Agent Status ---
    const { plan, questions, requiredEnvKeys } = parsedResponse;
    let nextAgentStatus: string;

    if (questions.length > 0) {
      nextAgentStatus = "PENDING_USER_INPUT";
    } else if (requiredEnvKeys.length > 0) {
      nextAgentStatus = "PENDING_CONFIGURATION"; // Skip questions, go straight to ENV config
    } else {
      nextAgentStatus = "READY_TO_EXECUTE"; // No questions, no ENV vars needed
    }
    log.info(`Determined next agent status: ${nextAgentStatus}`);

    // 7. --- Save Plan, Questions, Keys & Status to Database ---
    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        agentPlan: plan as any, // Prisma expects JsonValue
        agentClarificationQuestions: questions as any,
        agentRequiredEnvKeys: requiredEnvKeys as any, // Save the identified keys
        agentUserResponses: Prisma.JsonNull, // Clear previous responses
        agentCurrentStep: 0, // Reset to step 0
        agentStatus: nextAgentStatus,
        agentExecutionHistory: Prisma.JsonNull, // Clear previous history on new plan
      },
    });

    log.info(
      `Plan generated and saved for project ${projectId}. Status: ${nextAgentStatus}`
    );

    // 8. --- Return Relevant Data to Frontend ---
    return NextResponse.json(
      {
        plan: plan,
        questions: questions,
        requiredEnvKeys: requiredEnvKeys, // Send keys for potential immediate configuration if no questions
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
