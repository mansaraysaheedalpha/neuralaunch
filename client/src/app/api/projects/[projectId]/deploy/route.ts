// src/app/api/projects/[projectId]/deploy/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import { getVercelTeamId } from "@/lib/vercel";
import { env } from "@/lib/env"; // We import this for the encryption key

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
// Access the key (validated on startup by lib/env.ts)
const encryptionKey = env.ENCRYPTION_KEY;

// --- Helper: Make Authenticated Vercel API Calls ---
async function fetchVercelAPI(
  endpoint: string,
  token: string, // This will be the decrypted VERCEL_ACCESS_TOKEN
  options: RequestInit = {},
  teamId?: string | null
): Promise<unknown> {
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
    Object.assign(error, { code: errorCode });
    throw error;
  }

  if (response.status === 204) return null;
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

    // Note: GCM auth tag length can vary, but 16 bytes (128 bits) is common
    // We rely on the decipher.final() call to throw if the tag is invalid.

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

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

/**
 * Fetches and decrypts all ENV vars from the database for a project.
 * @returns A record of decrypted keys/values, or null if not found/error.
 */
async function getDecryptedEnvVars(
  projectId: string,
  userId: string
): Promise<Record<string, string> | null> {
  const project = await prisma.landingPage.findFirst({
    where: { id: projectId, userId: userId },
    select: { encryptedEnvVars: true },
  });

  if (!project?.encryptedEnvVars) {
    logger.error(
      `[Deploy] No encrypted ENV vars found for project ${projectId}.`
    );
    return null;
  }

  try {
    const decryptedJson = decryptData(project.encryptedEnvVars);
    return JSON.parse(decryptedJson) as Record<string, string>;
  } catch (e) {
    logger.error(
      `[Deploy] Failed to decrypt/parse ENV vars for project ${projectId}.`,
      e instanceof Error ? e : undefined
    );
    return null;
  }
}

// --- MAIN DEPLOY ROUTE ---
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const log = logger.child({ api: "/api/projects/[projectId]/deploy" });
  try {
    const { projectId } = params;
    log.info(`Deployment request received for project ${projectId}`);

    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized deploy request attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    log.info(`Authenticated user: ${userId}`);

    // --- 1. Fetch Project Data & Decrypted ENV Vars ---
    const [project, user, allEnvVars] = await Promise.all([
      prisma.landingPage.findFirst({
        where: { id: projectId, userId: userId },
        select: {
          id: true,
          title: true,
          githubRepoName: true,
          githubRepoUrl: true,
          vercelProjectId: true,
          vercelProjectUrl: true,
          // We fetch encryptedEnvVars separately via the helper
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { vercelTeamId: true },
      }),
      getDecryptedEnvVars(projectId, userId), // Decrypts and returns the env var object
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
    if (!allEnvVars) {
      return NextResponse.json(
        {
          error:
            "Environment variables are not configured for this project. Please configure them via the agent.",
        },
        { status: 400 }
      );
    }

    const vercelToken = allEnvVars["VERCEL_ACCESS_TOKEN"];
    if (!vercelToken) {
      return NextResponse.json(
        {
          error:
            "Vercel Access Token not found in configuration. Please re-run the agent configuration.",
        },
        { status: 401 }
      );
    }

    // --- 3. Get Vercel Team ID (Fetch and store if not present) ---
    let vercelTeamId: string | null = user?.vercelTeamId || null;
    if (vercelTeamId === null) {
      log.info(
        `Vercel Team ID not found in DB for user ${userId}. Fetching...`
      );
      vercelTeamId = await getVercelTeamId(vercelToken);
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

    // --- 4. Create Vercel Project (if needed) ---
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

        // --- Set Environment Variables ---

        // **IMPORTANT:** Do NOT send VERCEL_ACCESS_TOKEN back to Vercel
        const { VERCEL_ACCESS_TOKEN, ...envVarsToUpload } = allEnvVars;

        const finalVercelProjectUrl =
          vercelProjectUrl || `https://${vercelProjectId}.vercel.app`;
        // Inject system-managed URLs
        envVarsToUpload["NEXT_PUBLIC_APP_URL"] = finalVercelProjectUrl;
        envVarsToUpload["NEXTAUTH_URL"] = finalVercelProjectUrl;

        const envPayload = Object.entries(envVarsToUpload)
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
          (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "repository_not_found") ||
          (error instanceof Error && error.message?.includes("Git Repository not found"))
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
      // We do not update ENV vars on existing projects for simplicity.
      // User must manage them on Vercel or re-run config if needed.
    }

    // --- 5. Trigger Deployment ---
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
            target: "production", // This is a production deploy from the 'main' branch
            gitSource: {
              type: "github",
              repoId: project.githubRepoName,
              ref: "main",
            },
          }),
        },
        vercelTeamId
      )) as { url: string; alias?: { domain: string }[] };

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
      if (
        (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "forbidden") ||
        (error instanceof Error && error.message.includes("403")) ||
        (error instanceof Error && error.message.includes("401"))
      ) {
        log.warn(
          `Vercel token invalid for user ${userId}. Token may be expired or revoked.`
        );
        // We don't delete the token, just inform the user.
        return NextResponse.json(
          {
            error:
              "Vercel Access Token is invalid or expired. Please re-configure it via the agent.",
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `Failed to trigger deployment: ${error instanceof Error ? error.message : 'Unknown error'}` },
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
