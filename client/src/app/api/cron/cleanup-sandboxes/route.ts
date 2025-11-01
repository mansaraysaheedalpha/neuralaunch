//src/app/api/cron/cleanup-sandbox/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stopIdleSandboxes } from "@/lib/jobs/cleanup-sandboxes"; // Import the job function
import { logger } from "@/lib/logger"; // Your logger
import { env } from "@/lib/env";

// This function will handle GET requests triggered by Vercel Cron
export async function GET(request: NextRequest) {
  logger.info("[Cron Trigger] /api/cron/cleanup-sandboxes invoked.");

  // 1. --- Security Check ---
  // Vercel Cron Jobs send a bearer token in the Authorization header.
  // This token should match the CRON_SECRET environment variable
  // you have set in your Vercel project settings (and in your .env).
  const authToken = (request.headers.get("authorization") || "")
    .split("Bearer ")
    .at(1);

  if (!env.CRON_SECRET) {
    logger.error(
      "[Cron Trigger] CRON_SECRET environment variable is not set. Cannot verify request."
    );
    return NextResponse.json(
      { error: "Internal configuration error." },
      { status: 500 }
    );
  }

  if (authToken !== env.CRON_SECRET) {
    logger.warn("[Cron Trigger] Unauthorized attempt to access cron endpoint.");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. --- Execute the Job ---
  try {
    logger.info(
      "[Cron Trigger] Authorization successful. Executing stopIdleSandboxes job..."
    );
    const result = await stopIdleSandboxes(); // Call the actual cleanup logic
    logger.info(
      `[Cron Trigger] stopIdleSandboxes job finished. Result: ${JSON.stringify(result)}`
    );

    // Return a success response
    return NextResponse.json(
      {
        message: "Idle sandbox cleanup job executed successfully.",
        ...result, // Include stoppedCount and errors in response
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error(
      "[Cron Trigger] Error executing stopIdleSandboxes job:",
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      {
        error: "Failed to execute cleanup job.",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
