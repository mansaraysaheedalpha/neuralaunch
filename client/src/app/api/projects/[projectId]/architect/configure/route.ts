import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import {
  generatePlannerSystemInstruction,
  generatePlanningPrompt,
} from "@/lib/agent/planner-prompt";
// Import the full schema types to ensure consistency
import type {
  ActionableTask,
  ArchitectPreferences,
} from "@/types/agent-schemas";

// --- Zod Schema for User Preferences ---
const architectPreferencesSchema = z.object({
  preferences: z.object({
    mode: z.enum(["default", "custom"]),
    framework: z.string().optional(),
    uiLibrary: z.string().optional(),
    authentication: z.string().optional(),
    database: z.string().optional(),
    deployment: z.string().optional(),
    additionalContext: z.string().optional(),
  }),
});

// --- Zod Schema for AI Response (Parser) ---
// This now matches the ActionableTask type from agent-schemas.ts

const verificationSchema = z.object({
  commands: z.array(z.string()),
  successCriteria: z.string(),
});

const taskSchema = z.object({
  task: z.string(),
  files: z.array(z.string()),
  pattern: z.string(),
  rationale: z.string(),
  // ✅ FIX: Allow `null` and default to `[]`
  dependencies: z.array(z.number()).nullable().default([]),
  verification: verificationSchema,
  // ✅ FIX: Allow `null` and default to `null` (which is fine)
  uiDetails: z.string().nullable().default(null),
  // ✅ FIX: This was the main culprit. Allow `null` and default to `[]`.
  security: z.array(z.string()).nullable().default([]),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
});

const phaseSchema = z.object({
  phase: z.string(),
  tasks: z.array(taskSchema),
});

const strictAIPlanResponseSchema = z.object({
  architecture: z.any().optional(),
  plan: z.array(phaseSchema),
  questions: z.array(z.any()).optional().default([]),
  requiredEnvKeys: z.array(z.string()).optional().default([]),
  conditionalEnvKeys: z.any().optional(),
});

/**
 * Extracts JSON from a string that might be wrapped in markdown.
 */
function extractJsonFromString(text: string): string {
  const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = text.match(jsonRegex);
  if (match && match[1]) {
    return match[1];
  }
  // Fallback for raw JSON that might be truncated
  const braceIndex = text.indexOf("{");
  if (braceIndex > -1) {
    return text.substring(braceIndex);
  }
  return text;
}

/**
 * Flattens the plan from phases to a single array of tasks.
 */
function flattenPlan(plan: z.infer<typeof phaseSchema>[]): ActionableTask[] {
  return plan.flatMap((phase) =>
    phase.tasks.map((task) => ({
      ...task,
      dependencies: task.dependencies ?? [],
      security: task.security ?? [],
    }))
  );
}

/**
 * Consolidates all required and conditional env keys.
 */
function consolidateEnvKeys(
  parsed: z.infer<typeof strictAIPlanResponseSchema>
): string[] {
  const allKeys = new Set<string>();

  if (Array.isArray(parsed.requiredEnvKeys)) {
    parsed.requiredEnvKeys.forEach((key) => allKeys.add(key));
  }

  if (
    parsed.conditionalEnvKeys &&
    typeof parsed.conditionalEnvKeys === "object" &&
    !Array.isArray(parsed.conditionalEnvKeys)
  ) {
    for (const keys of Object.values(parsed.conditionalEnvKeys as Record<string, unknown>)) {
      if (Array.isArray(keys)) {
        keys.forEach((key) => allKeys.add(key as string));
      }
    }
  }

  // Always include VERCEL_ACCESS_TOKEN for deployment
  allKeys.add("VERCEL_ACCESS_TOKEN");

  return Array.from(allKeys);
}

// --- API Route ---
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const log = logger.child({
    api: "/api/projects/[projectId]/architect/configure",
  });

  try {
    const params = await context.params;
    const { projectId } = params;
    log.info(
      `Architect configuration request received for project ${projectId}`
    );

    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized access attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Validate request body
    const body: unknown = await req.json();
    const validation = architectPreferencesSchema.safeParse(body);

    if (!validation.success) {
      log.error("Invalid preferences format", undefined, {
        issues: validation.error.format(),
      });
      return NextResponse.json(
        {
          error: "Invalid preferences format",
          issues: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const { preferences } = validation.data;
    log.info(
      `User preferences: mode=${preferences.mode}, framework=${
        preferences.framework || "default"
      }`
    );

    // 3. Fetch project and blueprint
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      include: {
        conversation: {
          include: {
            messages: {
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
        `Blueprint content missing for project ${projectId}. Cannot generate plan.`
      );
      return NextResponse.json(
        {
          error: "Blueprint not found. Please generate a blueprint first.",
        },
        { status: 400 }
      );
    }

    // 4. Build planning prompt
    const systemInstruction = generatePlannerSystemInstruction();
    // Transform null values to undefined to match the expected type
    const normalizedPreferences = {
      mode: preferences.mode,
      framework: preferences.framework ?? undefined,
      uiLibrary: preferences.uiLibrary ?? undefined,
      authentication: preferences.authentication ?? undefined,
      database: preferences.database ?? undefined,
      deployment: preferences.deployment ?? undefined,
      additionalContext: preferences.additionalContext ?? undefined,
    };
    const planningPrompt = generatePlanningPrompt(
      blueprintContent,
      normalizedPreferences
    );

    // 5. Call AI
    log.info(`Requesting enhanced plan generation with user preferences...`);
    const aiResponseString = await executeAITaskSimple(
      AITaskType.AGENT_PLANNING,
      {
        systemInstruction: systemInstruction,
        prompt: planningPrompt,
        responseFormat: { type: "json_object" },
      }
    );

    // 6. Parse AI response
    let parsedResponse: z.infer<typeof strictAIPlanResponseSchema>;
    try {
      const cleanedJsonString = extractJsonFromString(aiResponseString);
      const rawJsonResponse: unknown = JSON.parse(cleanedJsonString);

      // Use the robust, strict schema
      parsedResponse = strictAIPlanResponseSchema.parse(rawJsonResponse);

      log.info(`AI plan parsed successfully.`);
    } catch (parseError) {
      log.error(
        `Failed to parse AI JSON response for ${projectId}:`,
        parseError instanceof Error ? parseError : undefined
      );
      log.error(`Raw AI Response: ${aiResponseString.substring(0, 500)}...`);
      return NextResponse.json(
        {
          error:
            "AI failed to generate a valid plan structure. Please try again.",
        },
        { status: 500 }
      );
    }

    // 7. Flatten plan and consolidate env keys
    const fullAtomicPlan = flattenPlan(parsedResponse.plan);
    const allRequiredEnvKeys = consolidateEnvKeys(parsedResponse);
    const questions = Array.isArray(parsedResponse.questions)
      ? parsedResponse.questions
      : [];

    // 8. Determine next status
    let nextAgentStatus: string;
    if (questions.length > 0) {
      nextAgentStatus = "PENDING_USER_INPUT";
    } else if (allRequiredEnvKeys.length > 0) {
      nextAgentStatus = "PENDING_CONFIGURATION";
    } else {
      nextAgentStatus = "READY_TO_EXECUTE";
    }

    log.info(`Determined next agent status: ${nextAgentStatus}`);

    // 9. Save to database
    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        agentArchitectPreferences: preferences as Prisma.InputJsonValue,
        agentArchitecturePlan:
          parsedResponse as unknown as Prisma.InputJsonValue,
        agentPlan: fullAtomicPlan as unknown as Prisma.InputJsonValue, // Save the full, detailed plan
        agentClarificationQuestions: questions as Prisma.InputJsonValue,
        agentRequiredEnvKeys: allRequiredEnvKeys as Prisma.InputJsonValue,
        agentUserResponses: Prisma.JsonNull,
        agentCurrentStep: 0,
        agentStatus: nextAgentStatus,
        agentExecutionHistory: Prisma.JsonNull,
      },
    });

    log.info(
      `Architect configuration and plan saved for project ${projectId}. Status: ${nextAgentStatus}`
    );

    // 10. Return response
    return NextResponse.json(
      {
        message: "Architect configured successfully. Plan generated.",
        plan: fullAtomicPlan,
        architecture: parsedResponse.architecture ?? null,
        questions: questions,
        requiredEnvKeys: allRequiredEnvKeys,
        agentStatus: nextAgentStatus,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during architect configuration";
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
