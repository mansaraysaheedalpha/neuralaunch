// src/app/api/achievements/route.ts

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { handleApiError, ErrorResponses } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type");
    const conversationId = searchParams.get("conversationId");

    const whereClause: Prisma.AchievementWhereInput = {
      userId: session.user.id,
    };

    if (type === "user") {
      // Fetch only achievements with NO conversationId
      whereClause.conversationId = null;
    } else if (conversationId) {
      // Fetch only achievements for the specific conversation
      whereClause.conversationId = conversationId;
    }
    // If no params given, fetch all achievements for the user (default)

    const achievements = await prisma.achievement.findMany({
      where: whereClause,
      orderBy: { unlockedAt: "desc" },
    });

    return successResponse(achievements);
  } catch (error) {
    return handleApiError(error, "GET /api/achievements");
  }
}
