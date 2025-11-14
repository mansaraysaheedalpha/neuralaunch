// src/app/api/sprint/start/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { parseTasksFromBlueprint, ParsedTask } from "@/lib/task-parser"; // Import ParsedTask type
import { z } from "zod"; // Import Zod
import { Prisma } from "@prisma/client"; // Import Prisma Transaction Client type
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

// Define Zod schema for request body
const startSprintSchema = z.object({
  conversationId: z.string().cuid({ message: "Invalid Conversation ID" }),
});

// Define a type for the Prisma Transaction Client
type PrismaTransactionClient = Omit<
  Prisma.TransactionClient,
  "$commit" | "$rollback"
>;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Rate limiting
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(session.user.id, clientIp);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMITS.API_AUTHENTICATED,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
            "X-RateLimit-Limit": RATE_LIMITS.API_AUTHENTICATED.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    const body: unknown = await req.json();

    // Validate request body
    const validation = startSprintSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { conversationId } = validation.data; // Use validated ID

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        messages: {
          where: { role: "model" },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    const blueprintMessage = conversation?.messages?.[0];
    // Add null check for conversation itself
    if (!conversation || !blueprintMessage?.content) {
      return new NextResponse("Blueprint not found or conversation missing", {
        status: 404,
      });
    }
    const blueprint = blueprintMessage.content;

    const parsedTasks: ParsedTask[] = parseTasksFromBlueprint(blueprint); // Type the result
    if (parsedTasks.length === 0) {
      return new NextResponse("Failed to parse tasks from blueprint", {
        status: 500,
      });
    }

    const startTime = new Date();
    const targetEndAt = new Date(startTime.getTime() + 72 * 60 * 60 * 1000);

    // Using a transaction with typed client and increased timeout
    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // Type the tx client
      // Delete existing tasks and reminders first
      await tx.taskReminder.deleteMany({ where: { task: { conversationId } } });
      await tx.task.deleteMany({ where: { conversationId } });

      // Use createMany for better performance instead of a loop
      await tx.task.createMany({
        data: parsedTasks.map(task => ({
          conversationId: conversationId,
          title: task.title,
          description: task.description,
          timeEstimate: task.timeEstimate,
          orderIndex: task.orderIndex,
          aiAssistantType: task.aiAssistantType, // Prisma handles optional enum correctly
        })),
      });

      // Get the created tasks to use the first task ID for reminders
      const createdTasks = await tx.task.findMany({
        where: { conversationId },
        orderBy: { orderIndex: 'asc' },
        select: { id: true },
      });

      await tx.sprint.upsert({
        where: { conversationId },
        update: {
          startedAt: startTime,
          targetEndAt: targetEndAt,
          totalTasks: parsedTasks.length,
          completedTasks: 0,
          // Reset AI assists count on restart? Optional, depends on desired logic.
          // aiAssistsUsed: 0,
        },
        create: {
          conversationId: conversationId,
          userId: session.user.id, // Ensure userId is included
          startedAt: startTime,
          targetEndAt: targetEndAt,
          totalTasks: parsedTasks.length,
        },
      });

      // Schedule reminders
      if (createdTasks.length > 0) {
        const firstTaskId = createdTasks[0].id;
        await tx.taskReminder.createMany({
          data: [
            {
              taskId: firstTaskId,
              userId: session.user.id,
              scheduledFor: new Date(startTime.getTime() + 24 * 60 * 60 * 1000),
              reminderType: "SPRINT_PROGRESS_CHECK_24H",
            },
            {
              taskId: firstTaskId,
              userId: session.user.id,
              scheduledFor: new Date(startTime.getTime() + 48 * 60 * 60 * 1000),
              reminderType: "SPRINT_PROGRESS_CHECK_48H",
            },
          ],
        });
        console.log(
          `✅ Scheduled 2 reminders for conversation ${conversationId}`
        );
      }
    }, {
      maxWait: 10000, // Maximum time to wait for transaction to start (10 seconds)
      timeout: 20000, // Maximum time for transaction to complete (20 seconds)
    });

    return NextResponse.json({ success: true, taskCount: parsedTasks.length });
  } catch (error: unknown) {
    // Type catch block
    console.error(
      "[SPRINT_START_ERROR]",
      error instanceof Error ? error.message : error
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
