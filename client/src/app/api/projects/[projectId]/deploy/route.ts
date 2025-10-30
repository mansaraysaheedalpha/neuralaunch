// src/app/api/projects/[projectId]/deploy/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import crypto from "crypto"; // *** Ensure crypto is imported ***
import { getVercelTeamId } from "@/lib/vercel";

// --- Vercel API Config & Types ---
const VERCEL_API_BASE = "https://api.vercel.com";
interface VercelErrorResponse {
  error?: {
    message?: string;
    code?: string;
  };
}
// Removed VercelTokenRefreshResponse as it's not needed

// --- Encryption/Decryption Config ---
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
// Access the key (validated on startup by lib/env.ts)
const encryptionKey = process.env.ENCRYPTION_KEY;

// --- Helper: Fetch Vercel Account Token ---
/**
 * Retrieves the user's stored Vercel access token.
 * Vercel uses long-lived tokens without refresh tokens.
 * @returns The access token or null if unavailable.
 */
async function getVercelToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId: userId, provider: "vercel" },
    select: {
      access_token: true,
    },
  });

  if (!account?.access_token) {
    logger.error(
      `[Vercel Deploy] Vercel access token not found for user ${userId}.`
    );
    return null; // No token available or stored
  }
  return account.access_token;
}

// --- Helper: Make Authenticated Vercel API Calls ---
async function fetchVercelAPI(
  endpoint: string,
  token: string,
  options: RequestInit = {},
  teamId?: string | null // Pass teamId if available
): Promise<any> {
  const url = `${VERCEL_API_BASE}${endpoint}${teamId ? `?teamId=${teamId}` : ""}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // Consider adding signal: AbortSignal.timeout(30000) for API call timeouts
  });

  if (!response.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      try {
        errorBody = await response.text();
      } catch {
        errorBody = null;
      }
    }
    const errorMessage =
      (errorBody as VercelErrorResponse)?.error?.message ||
      (typeof errorBody === "string" ? errorBody : response.statusText);
    const errorCode = (errorBody as VercelErrorResponse)?.error?.code;
    logger.error(
      `Vercel API Error (${response.status}) on ${endpoint}: ${errorMessage} (Code: ${errorCode || "N/A"})`
    );
    const error = new Error(
      `Vercel API Error (${response.status}): ${errorMessage}`
    );
    (error as any).code = errorCode;
    throw error;
  }

  if (response.status === 204) return null; // Handle No Content
  return response.json();
}

// --- Decryption Helper Function ---
/**
 * Decrypts data encrypted by encryptData using AES-256-GCM.
 * Expects input format "iv_base64.ciphertext_base64.authTag_base64".
 * @returns The original decrypted string (likely JSON).
 * @throws {Error} If decryption fails.
 */
function decryptData(encryptedString: string): string {
  // Runtime check for key presence (safeguard)
  if (!encryptionKey) {
    throw new Error(
      "Server configuration error: Encryption key is not available for decryption."
    );
  }
  if (
    !encryptedString ||
    typeof encryptedString !== "string" ||
    !encryptedString.includes(".")
  ) {
    throw new Error("Invalid encrypted data format.");
  }

  const parts = encryptedString.split(".");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted data format: Expected 3 parts separated by '.'"
    );
  }

  const [ivBase64, encryptedBase64, authTagBase64] = parts;

  try {
    const key = Buffer.from(encryptionKey, "base64");
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    // Basic validation of buffer lengths
    if (iv.length !== IV_LENGTH)
      throw new Error("Invalid IV length during decryption.");
    // GCM authTag length depends on the cipher but is typically 16 bytes for AES-256-GCM
    if (authTag.length !== 16)
      throw new Error("Invalid AuthTag length during decryption.");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag); // Set tag *before* decryption

    let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
    decrypted += decipher.final("utf8"); // Throws here if authTag is invalid

    return decrypted;
  } catch (error) {
    logger.error(
      "Decryption failed:",
      error instanceof Error ? error : undefined
    );
    throw new Error(
      "Failed to decrypt configuration data. Data might be corrupted, key incorrect, or data tampered with."
    );
  }
}

// --- MAIN DEPLOY ROUTE ---
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const log = logger.child({ api: "/api/projects/[projectId]/deploy" });
  try {
    const params = await context.params;
    const { projectId } = params;
    log.info(`Deployment request received for project ${projectId}`);

    // Runtime Encryption Key Check (Safeguard)
    if (
      !encryptionKey ||
      Buffer.from(encryptionKey, "base64").length !== KEY_LENGTH
    ) {
      log.error(
        "Server configuration error: Encryption key missing or invalid during deploy request."
      );
      return NextResponse.json(
        { error: "Internal server configuration error." },
        { status: 500 }
      );
    }

    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized deploy request attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    log.info(`Authenticated user: ${userId}`);

    // 2. --- Fetch Project Details (including encrypted ENV vars) & Vercel Token ---
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: {
        id: true,
        title: true,
        githubRepoName: true,
        githubRepoUrl: true,
        vercelProjectId: true,
        vercelProjectUrl: true,
        encryptedEnvVars: true, // Fetch encrypted data
      },
    });

    const user = await prisma.user.findUnique({
      // Fetch user to get stored teamId
      where: { id: userId },
      select: { vercelTeamId: true }, // *** ASSUMING you add `vercelTeamId String?` to User model ***
    });

    if (!project) {
      log.warn(
        `Project ${projectId} not found or forbidden for user ${userId}.`
      );
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }
    if (!project.githubRepoName || !project.githubRepoUrl) {
      log.warn(`GitHub repository missing for project ${projectId}.`);
      return NextResponse.json(
        { error: "GitHub repository must be created before deploying." },
        { status: 400 }
      );
    }

    const vercelToken = await getVercelToken(userId);
    if (!vercelToken) {
      // getVercelToken already logs the error
      return NextResponse.json(
        {
          error:
            "Vercel connection invalid or missing. Please connect your Vercel account.",
        },
        { status: 401 }
      );
    }

    // *** USE the stored teamId ***
    const vercelTeamId: string | null = user?.vercelTeamId || null;
    log.info(`Using Vercel Team ID: ${vercelTeamId || "Personal Account"}`);

    let vercelProjectId = project.vercelProjectId;
    let vercelProjectUrl = project.vercelProjectUrl;

    // 3. --- Create Vercel Project (if needed) ---
    if (!vercelProjectId) {
      log.info(`Creating new Vercel project for ${projectId}...`);
      try {
        const createProjectResponse = await fetchVercelAPI(
          `/v9/projects`, // teamId added by fetchVercelAPI
          vercelToken,
          {
            method: "POST",
            body: JSON.stringify({
              name: project.githubRepoName.split("/")[1], // Extract repo name
              framework: "nextjs",
              gitRepository: {
                type: "github",
                repo: project.githubRepoName,
              },
              // Ensure build command matches your setup if needed
              // buildCommand: "prisma generate && next build",
              // outputDirectory: ".next", // Default for Next.js
            }),
          },
          vercelTeamId
        );

        vercelProjectId = createProjectResponse.id;
        vercelProjectUrl = createProjectResponse.alias?.[0]?.domain
          ? `https://${createProjectResponse.alias[0].domain}`
          : null;
        log.info(
          `Vercel project created: ID ${vercelProjectId}, URL ${vercelProjectUrl || "N/A"}`
        );

        // --- Decrypt and Set Environment Variables ---
        let userEnvVars: Record<string, string> = {};
        if (project.encryptedEnvVars) {
          log.info(
            `Decrypting environment variables for Vercel project ${vercelProjectId}...`
          );
          try {
            const decryptedJson = decryptData(project.encryptedEnvVars);
            userEnvVars = JSON.parse(decryptedJson); // Parse the decrypted JSON string
            log.info(
              `Successfully decrypted ${Object.keys(userEnvVars).length} environment variables.`
            );
          } catch (decryptionError) {
            log.error(
              `Failed to decrypt/parse ENV vars for project ${projectId}:`,
              decryptionError instanceof Error ? decryptionError : undefined
            );
            return NextResponse.json(
              {
                error: `Failed to decrypt configuration: ${decryptionError instanceof Error ? decryptionError.message : "Unknown decryption error"}. Please reconfigure.`,
              },
              { status: 500 }
            );
          }
        } else {
          log.warn(
            `No encrypted environment variables found for project ${projectId}. Proceeding without setting user ENV vars.`
          );
        }

        // Add essential system-generated variables (overwrite if user provided them, maybe warn?)
        const finalVercelProjectUrl =
          vercelProjectUrl || `https://${vercelProjectId}.vercel.app`; // Use a fallback URL if alias not immediately available
        userEnvVars["NEXT_PUBLIC_APP_URL"] = finalVercelProjectUrl;
        userEnvVars["NEXTAUTH_URL"] = finalVercelProjectUrl;

        const envPayload = Object.entries(userEnvVars)
          .filter(([_, value]) => value != null && value !== "") // Ensure value exists
          .map(([key, value]) => ({
            type: "encrypted", // Vercel API encrypts the value upon receiving
            key: key,
            value: value, // Send the DECRYPTED value
            target: ["production", "preview", "development"],
          }));

        if (envPayload.length > 0) {
          log.info(
            `Setting ${envPayload.length} environment variables via Vercel API...`
          );
          await fetchVercelAPI(
            `/v10/projects/${vercelProjectId}/env`,
            vercelToken,
            { method: "POST", body: JSON.stringify(envPayload) },
            vercelTeamId
          );
          log.info(`Environment variables set successfully.`);
        } else {
          log.warn(
            `No environment variables to set for Vercel project ${vercelProjectId}.`
          );
        }

        // Save new Vercel info to DB
        await prisma.landingPage.update({
          where: { id: projectId },
          data: { vercelProjectId, vercelProjectUrl },
        });
      } catch (error: any) {
        log.error(
          `Failed to create Vercel project or set ENV vars for ${projectId}:`,
          error
        );
        if (
          error.code === "repository_not_found" ||
          error.message?.includes("Git Repository not found")
        ) {
          return NextResponse.json(
            {
              error: `Vercel could not access the GitHub repository '${project.githubRepoName}'. Ensure the Vercel GitHub App has permission.`,
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: `Failed to create Vercel project: ${error.message}` },
          { status: 500 }
        );
      }
    } else {
      log.info(`Using existing Vercel project ID: ${vercelProjectId}`);
      // NOTE: Not updating ENV vars for existing projects in this simplified flow.
    }

    // 4. --- Trigger Deployment ---
    log.info(`Triggering deployment for Vercel project ${vercelProjectId}...`);
    try {
      const deployResponse = await fetchVercelAPI(
        `/v13/deployments`,
        vercelToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: project.githubRepoName.split("/")[1], // App name
            projectId: vercelProjectId,
            target: "production",
            gitSource: {
              type: "github",
              repoId: project.githubRepoName, // owner/repo format
              ref: "main", // Agent pushes to main
            },
          }),
        },
        vercelTeamId
      );

      const deploymentUrl = `https://${deployResponse.url}`;
      // Use the project URL determined earlier or fallback if needed
      const finalProjectUrl =
        vercelProjectUrl ||
        `https://${deployResponse.alias?.[0]?.domain}` ||
        `https://${vercelProjectId}.vercel.app`;

      log.info(`Deployment triggered successfully. URL: ${deploymentUrl}`);

      // Save the latest deployment URL
      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          vercelDeploymentUrl: deploymentUrl,
          ...(finalProjectUrl && { vercelProjectUrl: finalProjectUrl }),
        },
      });

      // 5. --- Return Success Response ---
      return NextResponse.json(
        {
          message: "Deployment to Vercel triggered successfully.",
          projectId: vercelProjectId,
          projectUrl: finalProjectUrl,
          deploymentUrl: deploymentUrl,
        },
        { status: 200 }
      );
    } catch (error: any) {
      log.error(
        `Failed to trigger deployment for Vercel project ${vercelProjectId}:`,
        error
      );
      if (
        error.code === "repository_not_found" ||
        error.message?.includes("Git Repository not found")
      ) {
        return NextResponse.json(
          {
            error: `Vercel could not access the GitHub repository '${project.githubRepoName}'. Ensure the Vercel GitHub App has permission.`,
          },
          { status: 400 }
        );
      }
      // Handle token invalidation specifically
      if (
        error.code === "forbidden" ||
        (error instanceof Error && error.message.includes("403")) ||
        (error instanceof Error && error.message.includes("401"))
      ) {
        log.warn(
          `Vercel token likely invalid for user ${userId} during deployment trigger.`
        );
        // Optionally: Delete the invalid Vercel account record from DB?
        await prisma.account.deleteMany({
          where: { userId: userId, provider: "vercel" },
        });
        return NextResponse.json(
          {
            error:
              "Vercel authentication failed. Please reconnect your Vercel account.",
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `Failed to trigger deployment: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown internal error";
    log.error(
      `Unhandled error in deployment route: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
