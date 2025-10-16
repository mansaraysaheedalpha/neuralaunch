// src/app/api/sprint/assistant/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { runTaskAssistant } from "@/lib/ai-assistants";
import { AssistantType } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { taskId } = body;
    if (!taskId) {
      return new NextResponse("Missing taskId", { status: 400 });
    }

    // 1. Get Task and its context (the original blueprint)
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
            tags: true,
          },
        },
      },
    });

    if (!task || task.conversation.userId !== session.user.id) {
      return new NextResponse("Task not found or forbidden", { status: 404 });
    }

    if (!task.aiAssistantType) {
      return new NextResponse("This task does not have an AI assistant.", {
        status: 400,
      });
    }

    const blueprint = task.conversation.messages[0]?.content;
    if (!blueprint) {
      return new NextResponse("Blueprint not found for context.", {
        status: 404,
      });
    }

    // 2. Prepare the context for the AI assistant
    const context = {
      startupIdea: task.conversation.title,
      problemStatement:
        blueprint.match(/Problem Statement:\*\*\s*(.*?)\n/)?.[1] || "",
      solutionStatement:
        blueprint.match(/Solution Statement:\*\*\s*(.*?)\n/)?.[1] || "",
      targetMarket: task.conversation.tags.map((t) => t.tagName).join(", "),
    };

    // 3. Run the assistant and get the streaming response
    const assistantResponse = await runTaskAssistant(
      task.aiAssistantType as AssistantType,
      context
    );

    // 4. Save the full output to the database
    await prisma.taskOutput.create({
      data: {
        taskId: taskId,
        content: assistantResponse.content as any, // Prisma expects Json type
      },
    });

    // 5. Stream the response back to the client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const char of assistantResponse.content) {
          controller.enqueue(encoder.encode(char));
          await new Promise((res) => setTimeout(res, 5)); // Simulate streaming character by character
        }
        controller.close();
      },
    });

    return new Response(stream);
  } catch (error) {
    console.error("[ASSISTANT_API_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
