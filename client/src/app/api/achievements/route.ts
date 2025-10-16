// src/app/api/achievements/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Fetch all achievements for the currently logged-in user
    const achievements = await prisma.achievement.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        unlockedAt: "desc",
      },
    });

    return NextResponse.json(achievements);
  } catch (error) {
    console.error("[ACHIEVEMENTS_GET_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
