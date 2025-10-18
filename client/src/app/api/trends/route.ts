// src/app/api/trends/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// FIX: Line 7 - Define proper type instead of 'any'
interface CachedSnapshotData {
  timeframe: string;
  overview: {
    totalIdeas: number;
    growthRate: number;
    recentIdeas: number;
    mostActiveHour: { hour: number; count: number } | null;
  };
  topTags: Array<{
    rank: number;
    name: string;
    count: number;
    percentage: string;
  }>;
  topCombinations: Array<{ combination: string; count: number }>;
}

let cachedSnapshotData: CachedSnapshotData | null = null;
let cacheTimestamp: Date | null = null;
const CACHE_DURATION = 12 * 60 * 60 * 1000; // Cache for 12 hours

export async function GET(req: NextRequest) {
  const session = await auth();
  const isAuthenticated = !!session?.user?.id;

  try {
    const { searchParams } = new URL(req.url);
    const timeframe = isAuthenticated
      ? searchParams.get("timeframe") || "week"
      : "all";

    // --- Caching logic for unauthenticated users (unchanged) ---
    if (!isAuthenticated) {
      const now = new Date();
      if (
        cachedSnapshotData &&
        cacheTimestamp &&
        now.getTime() - cacheTimestamp.getTime() < CACHE_DURATION
      ) {
        return NextResponse.json({
          ...cachedSnapshotData,
          isSnapshot: true,
          snapshotDate: cacheTimestamp.toISOString(),
        });
      }
    }

    const now = new Date();
    let dateThreshold: Date;
    switch (timeframe) {
      case "day":
        dateThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // 'all'
        dateThreshold = new Date(0);
    }

    // =========================== THE FIX: PART 1 ===========================
    // We've updated the Prisma transaction to use the new schema.
    // The tag-related queries are now more complex and are handled separately.
    const [
      totalIdeas,
      previousPeriodIdeas,
      ideasByHour,
      conversationsWithTags,
      recentIdeas,
    ] = await prisma.$transaction([
      prisma.conversation.count({
        where: { createdAt: { gte: dateThreshold } },
      }),
      prisma.conversation.count({
        where: {
          createdAt: {
            gte: new Date(
              dateThreshold.getTime() -
                (now.getTime() - dateThreshold.getTime())
            ),
            lt: dateThreshold,
          },
        },
      }),
      prisma.$queryRaw<
        Array<{ hour: number; count: bigint }>
      >`SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as count FROM "Conversation" WHERE "createdAt" >= ${dateThreshold} GROUP BY hour ORDER BY count DESC LIMIT 1`,
      // UPDATED QUERY for conversations and their tags
      prisma.conversation.findMany({
        where: { createdAt: { gte: dateThreshold } },
        include: {
          tags: {
            // This is now the TagsOnConversations join table
            include: {
              tag: {
                // We need to include the actual Tag model
                select: { name: true }, // To get the name
              },
            },
          },
        },
        take: 500, // Limit to prevent performance issues with large datasets
      }),
      prisma.conversation.count({
        where: {
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // =========================== THE FIX: PART 2 ===========================
    // This new block queries for the top tags using the new schema.
    // This is done outside the transaction because it's a multi-step process.
    const topTagsGrouped = await prisma.tagsOnConversations.groupBy({
      by: ["tagId"],
      where: { assignedAt: { gte: dateThreshold } },
      _count: { tagId: true },
      orderBy: { _count: { tagId: "desc" } },
      take: 10,
    });

    const topTagIds = topTagsGrouped.map((group) => group.tagId);
    const topTagsDetails = await prisma.tag.findMany({
      where: { id: { in: topTagIds } },
    });
    const tagDetailsMap = new Map(
      topTagsDetails.map((tag) => [tag.id, tag.name])
    );

    const topTagsData = topTagsGrouped.map((group) => ({
      name: tagDetailsMap.get(group.tagId) || "Unknown Tag",
      count: group._count.tagId,
    }));
    // =======================================================================

    // --- Growth Rate calculation (unchanged) ---
    const growthRate =
      previousPeriodIdeas > 0
        ? ((totalIdeas - previousPeriodIdeas) / previousPeriodIdeas) * 100
        : totalIdeas > 0
          ? 100
          : 0;

    // =========================== THE FIX: PART 3 ===========================
    // Updated logic to calculate top combinations based on the new data structure.
    const tagPairs: { [key: string]: number } = {};
    conversationsWithTags.forEach((conv) => {
      // The path to the tag name is now conv.tags[...].tag.name
      const tags = conv.tags.map((t) => t.tag.name).sort();
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const pair = `${tags[i]} + ${tags[j]}`;
          tagPairs[pair] = (tagPairs[pair] || 0) + 1;
        }
      }
    });
    const topCombinations = Object.entries(tagPairs)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([combination, count]) => ({ combination, count }));
    // =======================================================================

    const response: CachedSnapshotData = {
      timeframe,
      overview: {
        totalIdeas,
        growthRate: Math.round(growthRate),
        recentIdeas,
        mostActiveHour: ideasByHour[0]
          ? {
              hour: Number(ideasByHour[0].hour),
              count: Number(ideasByHour[0].count),
            }
          : null,
      },
      // Map the new topTagsData structure to the response object
      topTags: topTagsData.map((item, index) => ({
        rank: index + 1,
        name: item.name,
        count: item.count,
        percentage:
          totalIdeas > 0 ? ((item.count / totalIdeas) * 100).toFixed(1) : "0.0",
      })),
      topCombinations,
    };

    // --- Caching logic for unauthenticated users (unchanged) ---
    if (!isAuthenticated) {
      cachedSnapshotData = response;
      cacheTimestamp = new Date();
      return NextResponse.json({
        ...response,
        isSnapshot: true,
        snapshotDate: cacheTimestamp.toISOString(),
      });
    }

    return NextResponse.json({ ...response, isSnapshot: false });
  } catch (error) {
    console.error("[TRENDS_GET_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
