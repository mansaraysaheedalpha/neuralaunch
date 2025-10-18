// src/app/api/achievements/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type");
    const conversationId = searchParams.get("conversationId");

    let whereClause: Prisma.AchievementWhereInput = {
      userId: session.user.id,
    };

    if (type === "user") {
      // If the UI asks for 'user' type, fetch only achievements with NO conversationId.
      whereClause.conversationId = null;
    } else if (conversationId) {
      // If a conversationId is provided, fetch only achievements for that specific conversation.
      whereClause.conversationId = conversationId;
    }
    // If no params are given, it will fetch all achievements for the user (default).

    const achievements = await prisma.achievement.findMany({
      where: whereClause,
      orderBy: { unlockedAt: "desc" },
    });

    return NextResponse.json(achievements);
  } catch (error) {
    console.error("[ACHIEVEMENTS_GET_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
