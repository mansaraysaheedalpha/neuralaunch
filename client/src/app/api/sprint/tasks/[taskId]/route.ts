// src/app/api/sprint/tasks/[taskId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";
import { checkAndGrantAchievements } from "@/lib/achievements";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { taskId } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status || !Object.values(TaskStatus).includes(status)) {
      return new NextResponse("Invalid status provided", { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        conversation: { select: { userId: true, id: true } },
        status: true,
      },
    });

    if (task?.conversation?.userId !== session.user.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: status,
        completedAt: status === TaskStatus.COMPLETE ? new Date() : null,
      },
    });

    // NEW: Update the parent Sprint record's progress
    if (task.status !== TaskStatus.COMPLETE && status === TaskStatus.COMPLETE) {
      // Increment if the task is newly completed
      await prisma.sprint.update({
        where: { conversationId: task.conversation.id },
        data: { completedTasks: { increment: 1 } },
      });
    } else if (
      task.status === TaskStatus.COMPLETE &&
      status !== TaskStatus.COMPLETE
    ) {
      // Decrement if the task is being un-completed
      await prisma.sprint.update({
        where: { conversationId: task.conversation.id },
        data: { completedTasks: { decrement: 1 } },
      });
    }

    let newAchievements = [];
    if (status === TaskStatus.COMPLETE) {
      newAchievements = await checkAndGrantAchievements(
        session.user.id,
        task.conversation.id
      );
    }

    return NextResponse.json({ updatedTask, newAchievements });
  } catch (error) {
    console.error("[TASK_UPDATE_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
