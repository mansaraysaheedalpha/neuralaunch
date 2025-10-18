// src/app/api/sprint/analytics/[conversationId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// Helper function remains the same
function parseTimeEstimate(timeEstimate: string): number {
  const lower = timeEstimate.toLowerCase();
  const value = parseInt(lower, 10) || 0;
  if (lower.includes("hour")) return value * 60;
  if (lower.includes("day")) return value * 24 * 60;
  return 0;
}

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

    // --- OPTIMIZATION ---
    // 1. Fetch the Sprint record directly. This is much faster.
    const sprint = await prisma.sprint.findUnique({
      where: {
        conversationId: conversationId,
        userId: session.user.id, // Security check
      },
    });

    if (!sprint) {
      // If no sprint has been started, return zeroed-out stats
      return NextResponse.json({
        totalTasks: 0,
        completedTasks: 0,
        completionPercentage: 0,
        aiAssistsUsed: 0,
        totalEstimatedHours: 0,
        hoursRemaining: 0,
      });
    }

    // 2. Fetch all tasks to calculate time and AI assists
    const tasks = await prisma.task.findMany({
      where: { conversationId },
      include: { outputs: true },
    });

    // 3. Calculate remaining stats
    const completionPercentage =
      sprint.totalTasks > 0
        ? Math.round((sprint.completedTasks / sprint.totalTasks) * 100)
        : 0;

    const aiAssistsUsed = tasks.reduce(
      (sum, task) => sum + task.outputs.length,
      0
    );

    let totalMinutes = 0;
    let completedMinutes = 0;
    tasks.forEach((task) => {
      const taskMinutes = parseTimeEstimate(task.timeEstimate);
      totalMinutes += taskMinutes;
      if (task.status === "COMPLETE") {
        completedMinutes += taskMinutes;
      }
    });

    const totalEstimatedHours = Math.round(totalMinutes / 60);
    const hoursRemaining = Math.round((totalMinutes - completedMinutes) / 60);

    // 4. Return the data, primarily from the efficient Sprint record
    return NextResponse.json({
      totalTasks: sprint.totalTasks,
      completedTasks: sprint.completedTasks,
      completionPercentage,
      aiAssistsUsed,
      totalEstimatedHours,
      hoursRemaining,
    });
  } catch (error) {
    console.error("[SPRINT_ANALYTICS_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
