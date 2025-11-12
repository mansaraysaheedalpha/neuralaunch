// app/api/user/settings/thought-preferences/route.ts
/**
 * User Thought Preferences API
 * Allows users to toggle deep dive mode globally
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user preferences (or create default)
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { thoughtPreferences: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const preferences = (user.thoughtPreferences as any) || {
      deepDiveEnabled: false,
      showMetadata: true,
      maxVisibleThoughts: 10,
    };

    return NextResponse.json({
      success: true,
      preferences,
    });
  } catch (error) {
    logger.error("[ThoughtPreferences] GET failed", error as Error);
    return NextResponse.json(
      { error: "Failed to get preferences" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await req.json();

    const { deepDiveEnabled, showMetadata, maxVisibleThoughts } = body;

    // Update user preferences
    await prisma.user.update({
      where: { id: userId },
      data: {
        thoughtPreferences: {
          deepDiveEnabled: deepDiveEnabled ?? false,
          showMetadata: showMetadata ?? true,
          maxVisibleThoughts: maxVisibleThoughts ?? 10,
        },
      },
    });

    logger.info(`[ThoughtPreferences] Updated for user ${userId}`, {
      deepDiveEnabled,
    });

    return NextResponse.json({
      success: true,
      message: "Preferences updated successfully",
    });
  } catch (error) {
    logger.error("[ThoughtPreferences] POST failed", error as Error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
