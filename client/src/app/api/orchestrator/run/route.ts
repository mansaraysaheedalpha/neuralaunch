// src/app/api/orchestrator/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { orchestrator } from "@/lib/orchestrator/agent-orchestrator";
import { createApiLogger } from "@/lib/logger";
import { z } from "zod";
import { inngest } from "@/inngest/client";

// ==========================================
// REQUEST VALIDATION SCHEMAS
// ==========================================

// Vision-based request (from Agentic Interface)
const visionRequestSchema = z.object({
  sourceType: z.literal("vision"),
  visionText: z.string().min(10, "Vision text must be at least 10 characters"),
  projectName: z.string().min(1, "Project name is required"),
  techPreferences: z
    .object({
      frontend: z.string().optional(),
      backend: z.string().optional(),
      database: z.string().optional(),
      deployment: z.string().optional(),
    })
    .optional(),
  async: z.boolean().optional().default(true),
});

// Blueprint-based request (from SprintDashboard)
const blueprintRequestSchema = z.object({
  sourceType: z.literal("blueprint"),
  conversationId: z.string().min(1, "Conversation ID is required"),
  blueprint: z.string().min(1, "Blueprint is required"),
  sprintData: z
    .object({
      completedTasks: z.array(z.any()).optional(),
      analytics: z.any().optional(),
      validationResults: z.any().optional(),
    })
    .optional(),
  async: z.boolean().optional().default(true),
});

// Legacy request (backward compatibility)
const legacyRequestSchema = z.object({
  conversationId: z.string().min(1, "Conversation ID is required"),
  blueprint: z.string().min(1, "Blueprint is required"),
  async: z.boolean().optional().default(true),
});

// Union of all schemas
const runOrchestratorSchema = z.discriminatedUnion("sourceType", [
  visionRequestSchema,
  blueprintRequestSchema,
]);

/**
 * POST /api/orchestrator/run
 *
 * Dual-mode orchestrator endpoint:
 * 1. Vision Mode: Direct vision-to-app build
 * 2. Blueprint Mode: Structured blueprint with optional sprint data
 * 3. Legacy Mode: Backward compatibility
 */
export async function POST(req: NextRequest) {
  const logger = createApiLogger({
    path: "/api/orchestrator/run",
    method: "POST",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("Unauthorized orchestrator run attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse and validate request body
    const body = await req.json();

    // Check if this is a legacy request (no sourceType)
    if (!body.sourceType) {
      logger.info("Legacy orchestrator request detected");
      return handleLegacyRequest(body, userId, logger);
    }

    // Validate modern request
    const validatedBody = runOrchestratorSchema.parse(body);

    // 3. Route to appropriate handler
    if (validatedBody.sourceType === "vision") {
      return handleVisionRequest(validatedBody, userId, logger);
    } else {
      return handleBlueprintRequest(validatedBody, userId, logger);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request body", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("Orchestrator endpoint error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ==========================================
// REQUEST HANDLERS
// ==========================================

/**
 * Handle vision-based build request
 */
async function handleVisionRequest(
  body: z.infer<typeof visionRequestSchema>,
  userId: string,
  logger: any
) {
  // Generate unique project ID
  const projectId = `proj_vision_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  logger.info("Vision-based build request", {
    projectId,
    projectName: body.projectName,
    visionLength: body.visionText.length,
    hasTechPreferences: !!body.techPreferences,
  });

  if (body.async) {
    // Trigger Inngest function for async execution
    await inngest.send({
      name: "agent/orchestrator.vision",
      data: {
        projectId,
        userId,
        sourceType: "vision",
        visionText: body.visionText,
        projectName: body.projectName,
        techPreferences: body.techPreferences,
      },
    });

    logger.info("Vision-based orchestration triggered asynchronously", {
      projectId,
    });

    return NextResponse.json({
      success: true,
      message: `Building "${body.projectName}" with AI agents. This will run in the background.`,
      projectId,
      async: true,
      estimatedDuration: "20-30 minutes",
      statusEndpoint: `/api/orchestrator/status/${projectId}`,
      executionDashboard: `/projects/${projectId}/execution`,
    });
  } else {
    // Synchronous execution (not recommended for production)
    logger.warn("Synchronous vision build requested - not recommended");

    const result = await orchestrator.executeVision({
      projectId,
      userId,
      visionText: body.visionText,
      projectName: body.projectName,
      techPreferences: body.techPreferences,
    });

    return NextResponse.json({
      ...result,
      async: false,
    });
  }
}

/**
 * Handle blueprint-based build request
 */
async function handleBlueprintRequest(
  body: z.infer<typeof blueprintRequestSchema>,
  userId: string,
  logger: any
) {
  // Generate unique project ID
  const projectId = `proj_blueprint_${Date.now()}_${body.conversationId.slice(0, 8)}`;

  logger.info("Blueprint-based build request", {
    projectId,
    conversationId: body.conversationId,
    hasSprintData: !!body.sprintData,
    blueprintLength: body.blueprint.length,
  });

  if (body.async) {
    // Trigger Inngest function for async execution
    await inngest.send({
      name: "agent/orchestrator.blueprint",
      data: {
        projectId,
        userId,
        conversationId: body.conversationId,
        sourceType: "blueprint",
        blueprint: body.blueprint,
        sprintData: body.sprintData,
      },
    });

    logger.info("Blueprint-based orchestration triggered asynchronously", {
      projectId,
    });

    return NextResponse.json({
      success: true,
      message: `Building from validated blueprint. This will run in the background.`,
      projectId,
      conversationId: body.conversationId,
      async: true,
      estimatedDuration: "20-30 minutes",
      statusEndpoint: `/api/orchestrator/status/${projectId}`,
      executionDashboard: `/projects/${projectId}/execution`,
    });
  } else {
    // Synchronous execution
    const result = await orchestrator.executeBlueprint({
      projectId,
      userId,
      conversationId: body.conversationId,
      blueprint: body.blueprint,
      sprintData: body.sprintData,
    });

    return NextResponse.json({
      ...result,
      async: false,
    });
  }
}

/**
 * Handle legacy request (backward compatibility)
 */
async function handleLegacyRequest(body: any, userId: string, logger: any) {
  try {
    const validatedBody = legacyRequestSchema.parse(body);

    const projectId = `proj_${Date.now()}_${validatedBody.conversationId.slice(0, 8)}`;

    logger.info("Legacy orchestration request", {
      projectId,
      conversationId: validatedBody.conversationId,
    });

    if (validatedBody.async) {
      await inngest.send({
        name: "agent/orchestrator.run",
        data: {
          projectId,
          userId,
          conversationId: validatedBody.conversationId,
          blueprint: validatedBody.blueprint,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Orchestration started. This will run in the background.",
        projectId,
        async: true,
        statusEndpoint: `/api/orchestrator/status/${projectId}`,
      });
    } else {
      const result = await orchestrator.execute({
        projectId,
        userId,
        conversationId: validatedBody.conversationId,
        blueprint: validatedBody.blueprint,
      });

      return NextResponse.json({
        ...result,
        async: false,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid legacy request", details: error.issues },
        { status: 400 }
      );
    }
    throw error;
  }
}

// ==========================================
// GET METHOD - Status Check
// ==========================================

/**
 * GET /api/orchestrator/run
 * Returns API documentation
 */
export async function GET() {
  return NextResponse.json({
    name: "NeuraLaunch Orchestrator API",
    version: "2.0",
    modes: {
      vision: {
        description: "Build applications directly from vision text",
        endpoint: "POST /api/orchestrator/run",
        payload: {
          sourceType: "vision",
          visionText: "string (min 10 chars)",
          projectName: "string",
          techPreferences: "object (optional)",
          async: "boolean (default: true)",
        },
      },
      blueprint: {
        description: "Build applications from validated blueprints",
        endpoint: "POST /api/orchestrator/run",
        payload: {
          sourceType: "blueprint",
          conversationId: "string",
          blueprint: "string",
          sprintData: "object (optional)",
          async: "boolean (default: true)",
        },
      },
      legacy: {
        description: "Backward compatibility mode",
        endpoint: "POST /api/orchestrator/run",
        payload: {
          conversationId: "string",
          blueprint: "string",
          async: "boolean (default: true)",
        },
      },
    },
    statusEndpoint: "GET /api/orchestrator/status/[projectId]",
    documentation: "https://docs.startupvalidator.app/api/orchestrator",
  });
}
