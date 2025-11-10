// src/app/api/orchestrator/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { orchestrator } from "@/lib/orchestrator/agent-orchestrator";
import { createApiLogger } from "@/lib/logger";
import { z } from "zod";
import { inngest } from "@/inngest/client";

// Request validation schema
const runOrchestratorSchema = z.object({
  conversationId: z.string().min(1, "Conversation ID is required"),
  blueprint: z.string().min(1, "Blueprint is required"),
  async: z.boolean().optional().default(true), // Run async via Inngest by default
});

/**
 * POST /api/orchestrator/run
 * Trigger the full agent pipeline (Analyzer -> Research -> Validation -> Planning)
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
    logger.info("Orchestrator run request received", { userId });

    // 2. Parse and validate request body
    const body = await req.json();
    const validatedBody = runOrchestratorSchema.parse(body);

    // 3. Generate project ID
    const projectId = `proj_${Date.now()}_${validatedBody.conversationId.slice(0, 8)}`;

    logger.info("Starting orchestration", {
      projectId,
      conversationId: validatedBody.conversationId,
      async: validatedBody.async,
    });

    // 4. Execute orchestrator (async or sync)
    if (validatedBody.async) {
      // Trigger Inngest function for async execution
      await inngest.send({
        name: "agent/orchestrator.run",
        data: {
          projectId,
          userId,
          conversationId: validatedBody.conversationId,
          blueprint: validatedBody.blueprint,
        },
      });

      logger.info("Orchestration triggered asynchronously", { projectId });

      return NextResponse.json({
        success: true,
        message: "Orchestration started. This will run in the background.",
        projectId,
        async: true,
        statusEndpoint: `/api/orchestrator/status/${projectId}`,
      });
    } else {
      // Run synchronously (not recommended for production)
      const result = await orchestrator.execute({
        projectId,
        userId,
        conversationId: validatedBody.conversationId,
        blueprint: validatedBody.blueprint,
      });

      logger.info("Orchestration completed synchronously", {
        projectId,
        success: result.success,
      });

      return NextResponse.json({
        ...result,
        async: false,
      });
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
