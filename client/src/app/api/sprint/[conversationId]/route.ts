// src/app/api/sprint/[conversationId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = await params;

    // Fetch the conversation and its tasks, ordering them correctly
    const conversationWithTasks = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        tasks: {
          orderBy: { orderIndex: "asc" },
          include: {
            outputs: true, // Also fetch any generated outputs
          },
        },
      },
    });

    if (!conversationWithTasks) {
      return new NextResponse("Sprint not found", { status: 404 });
    }

    return NextResponse.json(conversationWithTasks);
  } catch (error) {
    console.error("[SPRINT_GET_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
