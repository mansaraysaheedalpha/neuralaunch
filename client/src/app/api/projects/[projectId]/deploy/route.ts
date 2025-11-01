// src/app/api/projects/[projectId]/deploy/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import { getVercelTeamId } from "@/lib/vercel";
import { env } from "@/lib/env";

// --- Vercel API Config & Types ---
const VERCEL_API_BASE = "https://api.vercel.com";
interface VercelErrorResponse {
  error?: {
    message?: string;
    code?: string;
  };
}

// --- Encryption/Decryption Config ---
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
// Access the key (validated on startup by lib/env.ts)
const encryptionKey = env.ENCRYPTION_KEY;

// --- Helper: Fetch Vercel Account Token ---
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
    return null;
  }
  return account.access_token;
}

// --- Helper: Make Authenticated Vercel API Calls ---
// Replaced 'any' with 'unknown' for better type safety
async function fetchVercelAPI(
  endpoint: string,
  token: string,
  options: RequestInit = {},
  teamId?: string | null
): Promise<unknown> {
  // Changed from 'any' to 'unknown'
  const url = `${VERCEL_API_BASE}${endpoint}${teamId ? `?teamId=${teamId}` : ""}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
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
    // Attach code to the error object in a type-safe way
    Object.assign(error, { code: errorCode });
    throw error;
  }

  if (response.status === 204) return null; // Handle No Content
  return response.json();
}

// --- Decryption Helper Function ---
function decryptData(encryptedString: string): string {
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

    if (iv.length !== IV_LENGTH)
      throw new Error("Invalid IV length during decryption.");

    // *** REMOVED hardcoded authTag.length check ***
    // The decipher will throw an "Unsupported state" or "Invalid auth tag"
    // error if the tag is invalid, which is more reliable.

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
    decrypted += decipher.final("utf8");

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
// *** FIXED ROUTE HANDLER SIGNATURE ***
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> } // Correct App Router context
) {
  const log = logger.child({ api: "/api/projects/[projectId]/deploy" });
  try {
    // *** FIXED PARAM ACCESS ***
    const { projectId } = await params; // No await, direct destructuring
    log.info(`Deployment request received for project ${projectId}`);

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

    // --- 1. FETCH ALL DATA IN PARALLEL ---
    const [project, user, vercelToken] = await Promise.all([
      prisma.landingPage.findFirst({
        where: { id: projectId, userId: userId },
        select: {
          id: true,
          title: true,
          githubRepoName: true,
          githubRepoUrl: true,
          vercelProjectId: true,
          vercelProjectUrl: true,
          encryptedEnvVars: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { vercelTeamId: true },
      }),
      getVercelToken(userId), // This just reads from the Account table
    ]);

    // --- 2. VALIDATE DATA ---
    if (!project) {
      log.warn(`Project ${projectId} not found or forbidden.`);
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
    if (!vercelToken) {
      return NextResponse.json(
        { error: "Vercel connection invalid or missing. Please reconnect." },
        { status: 401 }
      );
    }

    // --- 3. GET VERCEL TEAM ID (LAZILY) ---
    let vercelTeamId: string | null = user?.vercelTeamId || null;

    // If we haven't stored a teamId yet, fetch it now and save it
    if (vercelTeamId === null) {
      log.info(
        `Vercel Team ID not found in DB for user ${userId}. Fetching...`
      );
      vercelTeamId = await getVercelTeamId(vercelToken); // Call the helper

      // If we found one, update the user record
      if (vercelTeamId) {
        await prisma.user.update({
          where: { id: userId },
          data: { vercelTeamId: vercelTeamId },
        });
        log.info(
          `Fetched and saved Vercel Team ID ${vercelTeamId} for user ${userId}.`
        );
      }
    }

    log.info(`Using Vercel Team ID: ${vercelTeamId || "Personal Account"}`);

    let vercelProjectId = project.vercelProjectId;
    let vercelProjectUrl = project.vercelProjectUrl;

    // --- 4. CREATE VERCEL PROJECT (if needed) ---
    if (!vercelProjectId) {
      log.info(`Creating new Vercel project for ${projectId}...`);
      try {
        const createProjectResponse = (await fetchVercelAPI(
          `/v9/projects`,
          vercelToken,
          {
            method: "POST",
            body: JSON.stringify({
              name: project.githubRepoName.split("/")[1],
              framework: "nextjs",
              gitRepository: { type: "github", repo: project.githubRepoName },
            }),
          },
          vercelTeamId
        )) as { id: string; alias?: { domain: string }[] };

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
            userEnvVars = JSON.parse(decryptedJson) as Record<string, string>;
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

        const finalVercelProjectUrl =
          vercelProjectUrl || `https://${vercelProjectId}.vercel.app`;
        userEnvVars["NEXT_PUBLIC_APP_URL"] = finalVercelProjectUrl;
        userEnvVars["NEXTAUTH_URL"] = finalVercelProjectUrl;

        const envPayload = Object.entries(userEnvVars)
          .filter(([_, value]) => value != null && value !== "")
          .map(([key, value]) => ({
            type: "encrypted",
            key: key,
            value: value,
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

        await prisma.landingPage.update({
          where: { id: projectId },
          data: { vercelProjectId, vercelProjectUrl },
        });
      } catch (error: unknown) {
        log.error(
          `Failed to create Vercel project or set ENV vars for ${projectId}:`,
          error instanceof Error ? error : undefined
        );
        if (
          (error as { code?: string }).code === "repository_not_found" ||
          (error instanceof Error &&
            error.message?.includes("Git Repository not found"))
        ) {
          return NextResponse.json(
            {
              error: `Vercel could not access the GitHub repository '${project.githubRepoName}'. Ensure the Vercel GitHub App has permission.`,
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          {
            error: `Failed to create Vercel project: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
          { status: 500 }
        );
      }
    } else {
      log.info(`Using existing Vercel project ID: ${vercelProjectId}`);
    }

    // 4. --- Trigger Deployment ---
    log.info(`Triggering deployment for Vercel project ${vercelProjectId}...`);
    try {
      const deployResponse = (await fetchVercelAPI(
        `/v13/deployments`,
        vercelToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: project.githubRepoName.split("/")[1],
            projectId: vercelProjectId,
            target: "production",
            gitSource: {
              type: "github",
              repoId: project.githubRepoName,
              ref: "main",
            },
          }),
        },
        vercelTeamId
      )) as { url: string; alias?: { domain: string }[] }; // Added type assertion

      const deploymentUrl = `https://${deployResponse.url}`;
      const finalProjectUrl =
        vercelProjectUrl ||
        `https://${deployResponse.alias?.[0]?.domain}` ||
        `https://${vercelProjectId}.vercel.app`;

      log.info(`Deployment triggered successfully. URL: ${deploymentUrl}`);

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
    } catch (error: unknown) {
      log.error(
        `Failed to trigger deployment for Vercel project ${vercelProjectId}:`,
        error instanceof Error ? error : undefined
      );
      if (
        (error as { code?: string }).code === "repository_not_found" ||
        (error instanceof Error &&
          error.message?.includes("Git Repository not found"))
      ) {
        return NextResponse.json(
          {
            error: `Vercel could not access the GitHub repository '${project.githubRepoName}'. Ensure the Vercel GitHub App has permission.`,
          },
          { status: 400 }
        );
      }
      if (
        (error as { code?: string }).code === "forbidden" ||
        (error instanceof Error && error.message.includes("403")) ||
        (error instanceof Error && error.message.includes("401"))
      ) {
        log.warn(
          `Vercel token likely invalid for user ${userId} during deployment trigger.`
        );
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
        {
          error: `Failed to trigger deployment: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
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
