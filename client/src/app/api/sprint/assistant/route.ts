// src/app/api/sprint/assistant/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { runTaskAssistant, AssistantContext } from "@/lib/ai-assistants";
// Removed unused AssistantType import
import { checkAndGrantAIAchievement } from "@/lib/achievements";
import { z } from "zod"; // Import Zod
import { Prisma } from "@prisma/client"; // Import Prisma JsonValue

// Define Zod schema for the request body
const assistantRequestSchema = z.object({
  taskId: z.string().cuid({ message: "Invalid Task ID" }),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body: unknown = await req.json();
    const validation = assistantRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { taskId } = validation.data;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        conversation: {
          include: {
            messages: {
              where: { role: "model" },
              take: 1,
              orderBy: { createdAt: "asc" },
            },
            tags: { include: { tag: { select: { name: true } } } },
          },
        },
      },
    });

    if (!task?.conversation || task.conversation.userId !== session.user.id) {
      return new NextResponse("Task not found or forbidden", { status: 404 });
    }
    if (!task.aiAssistantType) {
      return new NextResponse("This task does not have an AI assistant.", {
        status: 400,
      });
    }

    let assistantResponse;
    const assistantType = task.aiAssistantType;

    if (assistantType === "GENERAL") {
      console.log("🤖 Running disciplined GENERAL assistant...");
      // --- FIX: Provide minimal required context ---
      const minimalContext: AssistantContext = {
        startupIdea: task.conversation.title,
      };
      assistantResponse = await runTaskAssistant(
        assistantType,
        minimalContext,
        task.description
      );
      // ------------------------------------------
    } else {
      console.log(`🤖 Running specialized ${assistantType} assistant...`);
      const blueprint = task.conversation.messages[0]?.content;
      if (!blueprint) {
        return new NextResponse("Blueprint not found for context.", {
          status: 404,
        });
      }
      const context: AssistantContext = {
        // Explicitly type context
        startupIdea: task.conversation.title,
        problemStatement:
          blueprint.match(/Problem Statement:\*\*\s*(.*?)\n/)?.[1] || "",
        solutionStatement:
          blueprint.match(/Solution Statement:\*\*\s*(.*?)\n/)?.[1] || "",
        targetMarket: task.conversation.tags.map((t) => t.tag.name).join(", "),
      };
      assistantResponse = await runTaskAssistant(assistantType, context);
    }

    await prisma.$transaction(async (tx) => {
      type TxClient = Omit<Prisma.TransactionClient, "$commit" | "$rollback">;

      await (tx as TxClient).taskOutput.deleteMany({
        where: { taskId: taskId },
      });
      console.log(`🗑️ Deleted old outputs for task ${taskId}`);

      await (tx as TxClient).taskOutput.create({
        data: {
          taskId: taskId,
          content: (assistantResponse.content ?? "") as Prisma.InputJsonValue,
        },
      });
      console.log(`💾 Created new output for task ${taskId}`);
      await tx.sprint.update({
        where: { conversationId: task.conversationId },
        data: { aiAssistsUsed: { increment: 1 } },
      });
    });

    void checkAndGrantAIAchievement(session.user.id);

    // Streaming logic remains the same
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Ensure content is a string before iterating
        const contentString =
          typeof assistantResponse.content === "string"
            ? assistantResponse.content
            : JSON.stringify(assistantResponse.content);
        for (const char of contentString) {
          controller.enqueue(encoder.encode(char));
          await new Promise((res) => setTimeout(res, 5));
        }
        controller.close();
      },
    });

    return new Response(stream);
  } catch (error: unknown) {
    // Type catch block
    console.error(
      "[ASSISTANT_API_ERROR]",
      error instanceof Error ? error.message : error
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
