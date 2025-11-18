// src/app/api/user/github-status/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkGitHubConnection } from "@/lib/github-connection";
import { createApiLogger } from "@/lib/logger";

/**
 * GET /api/user/github-status
 * Check if the current user has connected their GitHub account
 */
export async function GET() {
  const logger = createApiLogger({
    path: "/api/user/github-status",
    method: "GET",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { isConnected, hasToken } = await checkGitHubConnection(userId);

    logger.info("GitHub status checked", {
      userId,
      isConnected,
      hasToken,
    });

    return NextResponse.json({
      isConnected,
      hasToken,
      ready: isConnected && hasToken,
    });
  } catch (error) {
    logger.error("GitHub status check error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
