// src/app/api/projects/[projectId]/env/configure/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client"; // Import Prisma namespace for JsonNull
import { z } from "zod";
import { logger } from "@/lib/logger";
import crypto from "crypto"; // Node.js crypto module for encryption

// --- Configuration ---
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // Bytes for GCM
// REMOVED SALT_LENGTH and PBKDF2_ITERATIONS
const KEY_LENGTH = 32; // Bytes for AES-256

// --- Environment Variable Validation ---
const encryptionKey = process.env.ENCRYPTION_KEY;
if (
  !encryptionKey ||
  Buffer.from(encryptionKey, "base64").length !== KEY_LENGTH
) {
  logger.error(
    "FATAL: ENCRYPTION_KEY is missing or not a valid 32-byte base64 string in environment variables."
  );
  // Consider throwing an error here during server startup in a real production environment
}

// --- Zod Schema for Input Validation ---
const envConfigureRequestSchema = z.object({
  environmentVariables: z
    .record(
      z
        .string()
        .min(1)
        .max(100)
        .regex(/^[A-Z0-9_]+$/, "Invalid ENV key format"),
      z.string().max(5000) // Limit value length for safety
    )
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "Environment variables cannot be empty.",
    }),
});

// --- Encryption Helper ---
/**
 * Encrypts a string using AES-256-GCM with the application's ENCRYPTION_KEY.
 * @returns Base64 encoded string containing "iv_base64.ciphertext_base64.authTag_base64"
 */
function encryptData(data: string): string {
  if (!encryptionKey) {
    throw new Error(
      "Server configuration error: Encryption key is not available."
    );
  }
  const key = Buffer.from(encryptionKey, "base64");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag(); // Get the authentication tag

  // Combine IV, encrypted data, and authTag for storage
  return `${iv.toString("base64")}.${encrypted}.${authTag.toString("base64")}`;
}

// --- API Route Handler ---
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const log = logger.child({ api: "/api/projects/[projectId]/env/configure" });
  try {
    const params = await context.params;
    const { projectId } = params;
    log.info(`ENV configuration request for project ${projectId}`);

    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized access attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    log.info(`Authenticated user: ${userId}`);

    // Check if ENCRYPTION_KEY is properly set (essential for function)
    if (!encryptionKey) {
      log.error(
        "Server configuration error: Encryption key is missing during request."
      );
      return NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      );
    }

    // 2. --- Fetch Project & Verify State ---
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { id: true, agentStatus: true },
    });

    if (!project) {
      log.warn(`Project ${projectId} not found or forbidden.`);
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }
    // *** HARD ERROR CHECK for status ***
    if (project.agentStatus !== "PENDING_CONFIGURATION") {
      log.warn(
        `Project ${projectId} is not in PENDING_CONFIGURATION status (current: ${project.agentStatus}). Configuration rejected.`
      );
      return NextResponse.json(
        {
          error: `Agent is not awaiting configuration (status: ${project.agentStatus}). Please wait or restart planning.`,
        },
        { status: 400 }
      ); // Return 400 Bad Request
    }

    // 3. --- Input Validation ---
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validation = envConfigureRequestSchema.safeParse(body);
    if (!validation.success) {
      log.error(
        "Invalid request body for ENV configuration.",
        undefined,
        { issues: validation.error.format() }
      );
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { environmentVariables } = validation.data;
    log.info(
      `Received ${Object.keys(environmentVariables).length} environment variables to encrypt.`
    );

    // 4. --- Encrypt Data ---
    let encryptedData: string;
    try {
      const jsonData = JSON.stringify(environmentVariables);
      encryptedData = encryptData(jsonData);
      log.info(
        `Successfully encrypted environment variables for project ${projectId}.`
      );
    } catch (encError) {
      log.error(
        `Encryption failed for project ${projectId}:`,
        encError instanceof Error ? encError : undefined
      );
      // Log specific error message if available
      const message =
        encError instanceof Error
          ? encError.message
          : "Encryption process failed.";
      return NextResponse.json(
        { error: "Failed to secure configuration data.", message: message },
        { status: 500 }
      );
    }

    // 5. --- Save Encrypted Data, Update Status, Clear Keys ---
    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        encryptedEnvVars: encryptedData,
        agentStatus: "READY_TO_EXECUTE",
        agentRequiredEnvKeys: Prisma.JsonNull, // *** CLEAR the list of required keys ***
      },
    });

    log.info(
      `Encrypted ENV vars saved, status updated to READY_TO_EXECUTE, required keys cleared for project ${projectId}.`
    );

    // 6. --- Return Success ---
    return NextResponse.json(
      {
        message:
          "Environment variables configured securely. Agent is ready to build.",
        agentStatus: "READY_TO_EXECUTE",
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error configuring environment variables";
    log.error(
      `Error: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
