// src/app/api/sprint/tasks/[taskId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { TaskStatus, Task, Prisma } from "@prisma/client"; // Import Task type and Prisma helper
import { checkAndGrantAchievements } from "@/lib/achievements";
import { z } from "zod"; // Import Zod

// Define Zod schema for the request body, using the TaskStatus enum
const updateTaskSchema = z.object({
  status: z.nativeEnum(TaskStatus), // Ensures status is one of the valid enum values
});

// Define a type for the task data we select initially
type TaskWithConversation = Prisma.TaskGetPayload<{
  select: {
    status: true;
    conversation: { select: { userId: true; id: true } };
  };
}>;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { taskId } = params;
    const body: unknown = await req.json(); // Assign to unknown first

    // Validate the request body using Zod
    const validation = updateTaskSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid status provided", issues: validation.error.format() },
        { status: 400 }
      );
    }
    // Use the validated status
    const { status } = validation.data;

    // Fetch the task with the specific type
    const task: TaskWithConversation | null = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        conversation: { select: { userId: true, id: true } },
        status: true,
      },
    });

    // Add null check for task and conversation
    if (!task?.conversation || task.conversation.userId !== session.user.id) {
      return new NextResponse("Task not found or forbidden", { status: 403 });
    }

    if (task.status === status) {
      return NextResponse.json({ updatedTask: task, newAchievements: [] });
    }

    // Perform the core database updates in a transaction
    // Explicitly type the result of the transaction
    const updatedTask: Task = await prisma.$transaction(async (tx) => {
      // Define Prisma transaction client type locally
      type TxClient = Omit<Prisma.TransactionClient, "$commit" | "$rollback">;

      // Type the taskUpdate variable
      const taskUpdate: Task = await (tx as TxClient).task.update({
        where: { id: taskId },
        data: {
          status: status, // Use validated status
          completedAt: status === TaskStatus.COMPLETE ? new Date() : null,
        },
      });

      // Update sprint counter based on status change
      if (status === TaskStatus.COMPLETE) {
        await (tx as TxClient).sprint.update({
          where: { conversationId: task.conversation.id },
          data: { completedTasks: { increment: 1 } },
        });
      } else if (task.status === TaskStatus.COMPLETE) {
        // Only decrement if the *previous* status was COMPLETE
        await (tx as TxClient).sprint.update({
          where: { conversationId: task.conversation.id },
          data: { completedTasks: { decrement: 1 } },
        });
      }

      return taskUpdate; // Return the updated task from the transaction
    });

    // Check achievements AFTER the transaction
    let newAchievements = [];
    if (status === TaskStatus.COMPLETE) {
      // Pass the required conversationId safely
      newAchievements = await checkAndGrantAchievements(
        session.user.id,
        task.conversation.id
      );
    }

    return NextResponse.json({ updatedTask, newAchievements });
  } catch (error: unknown) {
    // Type catch block
    console.error(
      "[TASK_UPDATE_ERROR]",
      error instanceof Error ? error.message : error
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
