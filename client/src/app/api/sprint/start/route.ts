// src/app/api/sprint/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { parseTasksFromBlueprint } from "@/lib/task-parser";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = await req.json();
    if (!conversationId) {
      return new NextResponse("Missing conversationId", { status: 400 });
    }

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

    if (!conversation || conversation.messages.length === 0) {
      return new NextResponse("Blueprint not found", { status: 404 });
    }

    const parsedTasks = parseTasksFromBlueprint(
      conversation.messages[0].content
    );
    if (parsedTasks.length === 0) {
      return new NextResponse("Failed to parse tasks", { status: 500 });
    }

    const startTime = new Date();
    const targetEndAt = new Date(startTime.getTime() + 72 * 60 * 60 * 1000);

    // Using a transaction to ensure all operations succeed or fail together
    await prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { conversationId } });
      await tx.taskReminder.deleteMany({ where: { task: { conversationId } } });

      const createdTasks = [];
      for (const task of parsedTasks) {
        const createdTask = await tx.task.create({
          data: {
            conversationId: conversationId,
            title: task.title,
            description: task.description,
            timeEstimate: task.timeEstimate,
            orderIndex: task.orderIndex,
            aiAssistantType: task.aiAssistantType,
          },
        });
        createdTasks.push(createdTask);
      }

      await tx.sprint.upsert({
        where: { conversationId },
        update: {
          startedAt: startTime,
          targetEndAt: targetEndAt,
          totalTasks: parsedTasks.length,
          completedTasks: 0,
        },
        create: {
          conversationId: conversationId,
          userId: session.user.id,
          startedAt: startTime,
          targetEndAt: targetEndAt,
          totalTasks: parsedTasks.length,
        },
      });

      // NEW: Schedule two reminders
      if (createdTasks.length > 0) {
        const firstTaskId = createdTasks[0].id;
        await tx.taskReminder.createMany({
          data: [
            // Reminder 1: 24 hours after starting
            {
              taskId: firstTaskId,
              userId: session.user.id,
              scheduledFor: new Date(startTime.getTime() + 24 * 60 * 60 * 1000),
              reminderType: "SPRINT_PROGRESS_CHECK_24H",
            },
            // Reminder 2: 48 hours after starting
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
    });

    return NextResponse.json({ success: true, taskCount: parsedTasks.length });
  } catch (error) {
    console.error("[SPRINT_START_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
