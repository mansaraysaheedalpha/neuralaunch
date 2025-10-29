//src/app/api/projects/[projectId]/deploy/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Vercel API base URL
const VERCEL_API_BASE = "https://api.vercel.com";

// Type for Vercel API error response
interface VercelErrorResponse {
  error?: {
    message?: string;
  };
}

// Helper to make authenticated Vercel API calls
async function fetchVercelAPI(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${VERCEL_API_BASE}${endpoint}`;
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
    logger.error(
      `Vercel API Error (${response.status}) on ${endpoint}: ${errorMessage}`
    );
    throw new Error(`Vercel API Error (${response.status}): ${errorMessage}`);
  }

  // Handle responses that might have no content (e.g., 204)
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const params = await context.params;
    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { projectId } = params;

    // Fetch project, ensure ownership, and get necessary details
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: {
        id: true,
        title: true,
        githubRepoName: true, // Need format "owner/repo-name"
        githubRepoUrl: true,
        vercelProjectId: true,
        vercelProjectUrl: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }
    if (!project.githubRepoName || !project.githubRepoUrl) {
      return NextResponse.json(
        { error: "GitHub repository must be created before deploying." },
        { status: 400 }
      );
    }

    // 2. --- Fetch Vercel Access Token ---
    const vercelAccount = await prisma.account.findFirst({
      where: { userId: userId, provider: "vercel" },
      select: { access_token: true }, // team_id is not a field in the Account model
    });

    if (!vercelAccount?.access_token) {
      logger.error(
        `[Vercel Deploy] Vercel access token not found for user ${userId} on project ${projectId}.`
      );
      return NextResponse.json(
        {
          error:
            "Vercel account not connected or token missing. Please connect your Vercel account.",
        },
        { status: 400 }
      );
    }
    const vercelToken = vercelAccount.access_token;
    const vercelTeamId: string | null = null; // team_id is not stored in the Account model

    let vercelProjectId = project.vercelProjectId;
    let vercelProjectUrl = project.vercelProjectUrl;
    const vercelApiHeaders = vercelTeamId
      ? { Authorization: `Bearer ${vercelToken}` }
      : { Authorization: `Bearer ${vercelToken}` };
    const teamQueryParam = vercelTeamId ? `?teamId=${vercelTeamId}` : ""; // Add teamId query param if available

    // 3. --- Create Vercel Project if it doesn't exist ---
    if (!vercelProjectId) {
      logger.info(
        `[Vercel Deploy] No existing Vercel project found for ${projectId}. Creating new project...`
      );

      try {
        const createProjectResponse = await fetchVercelAPI(
          `/v9/projects${teamQueryParam}`,
          vercelToken,
          {
            method: "POST",
            body: JSON.stringify({
              name: project.githubRepoName.split("/")[1], // Extract repo name from "owner/repo-name"
              framework: "nextjs", // Set framework preset
              gitRepository: {
                type: "github",
                repo: project.githubRepoName, // Should be "owner/repo-name"
              },
              // Optionally set root directory if code isn't at the root
              // rootDirectory: "./"
            }),
          }
        );

        vercelProjectId = createProjectResponse.id;
        vercelProjectUrl = `https://${createProjectResponse.alias[0].domain}`; // Use the first default alias

        logger.info(
          `[Vercel Deploy] Vercel project created: ID ${vercelProjectId}, URL ${vercelProjectUrl}`
        );

        // --- Set Environment Variables ---
        // Fetch required ENV vars (DATABASE_URL, NEXTAUTH_SECRET, GOOGLE keys, GITHUB keys, PUSHER keys etc.)
        // IMPORTANT: You MUST retrieve these securely, potentially from your own app's config or a vault.
        // DO NOT expose secrets client-side.
        const envVars = [
          {
            key: "DATABASE_URL",
            value: process.env.DATABASE_URL || "",
            target: ["production", "preview", "development"],
          },
          {
            key: "NEXTAUTH_SECRET",
            value: process.env.NEXTAUTH_SECRET || "",
            target: ["production", "preview", "development"],
          },
          {
            key: "GOOGLE_CLIENT_ID",
            value: process.env.GOOGLE_CLIENT_ID || "",
            target: ["production", "preview", "development"],
          },
          {
            key: "GOOGLE_CLIENT_SECRET",
            value: process.env.GOOGLE_CLIENT_SECRET || "",
            target: ["production", "preview", "development"],
          },
          // Add other necessary keys: GITHUB, PUSHER, RESEND, STRIPE, OPENAI, ANTHROPIC etc.
          // ...
        ].filter((env) => env.value); // Filter out any potentially missing env vars

        logger.info(
          `[Vercel Deploy] Setting ${envVars.length} environment variables for project ${vercelProjectId}...`
        );

        // Vercel API for setting ENV vars (v9 or v10) - requires multiple calls
        // Use v10 bulk endpoint
        await fetchVercelAPI(
          `/v10/projects/${vercelProjectId}/env${teamQueryParam}`,
          vercelToken,
          {
            method: "POST",
            body: JSON.stringify(
              envVars.map((env) => ({
                type: "encrypted", // Always encrypt secrets
                key: env.key,
                value: env.value,
                target: env.target,
              }))
            ),
          }
        );

        logger.info(`[Vercel Deploy] Environment variables set successfully.`);

        // Save Vercel info to DB
        await prisma.landingPage.update({
          where: { id: projectId },
          data: {
            vercelProjectId: vercelProjectId,
            vercelProjectUrl: vercelProjectUrl,
          },
        });
      } catch (error: any) {
        logger.error(
          `[Vercel Deploy] Failed to create Vercel project or set ENV vars for ${projectId}:`,
          error
        );
        return NextResponse.json(
          { error: `Failed to create Vercel project: ${error.message}` },
          { status: 500 }
        );
      }
    } else {
      logger.info(
        `[Vercel Deploy] Found existing Vercel project ID: ${vercelProjectId}`
      );
      // Optional: You could add logic here to update ENV vars if they've changed in your .env
    }

    // 4. --- Trigger Deployment ---
    logger.info(
      `[Vercel Deploy] Triggering deployment for project ${vercelProjectId}...`
    );
    try {
      const deployResponse = await fetchVercelAPI(
        `/v13/deployments${teamQueryParam}`,
        vercelToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: project.githubRepoName.split("/")[1], // Your app name
            projectId: vercelProjectId,
            target: "production", // Or 'preview' depending on your flow
            gitSource: {
              type: "github",
              repoId: project.githubRepoName, // Assuming owner/repo format works, might need repo ID
              ref: "main", // Deploy the 'main' branch pushed by the agent
            },
          }),
        }
      );

      const deploymentUrl = `https://${deployResponse.url}`; // The specific deployment URL
      const finalProjectUrl =
        vercelProjectUrl || `https://${deployResponse.alias[0].domain}`; // Fallback to get project URL

      logger.info(
        `[Vercel Deploy] Deployment triggered successfully. URL: ${deploymentUrl}`
      );

      // Save the latest deployment URL
      await prisma.landingPage.update({
        where: { id: projectId },
        data: {
          vercelDeploymentUrl: deploymentUrl,
          vercelProjectUrl: finalProjectUrl,
        }, // Update project URL too if needed
      });

      // 5. --- Return Success Response ---
      return NextResponse.json(
        {
          message: "Deployment to Vercel triggered successfully.",
          projectId: vercelProjectId,
          projectUrl: finalProjectUrl,
          deploymentUrl: deploymentUrl, // Specific deployment instance URL
        },
        { status: 200 } // 200 OK as deployment is async
      );
    } catch (error: any) {
      logger.error(
        `[Vercel Deploy] Failed to trigger deployment for Vercel project ${vercelProjectId}:`,
        error
      );
      // Common error: Vercel might not have access to the GitHub repo yet.
      // The error message from Vercel should indicate this.
      if (
        error.message?.includes("Git Repository not found") ||
        error.message?.includes("cannot access")
      ) {
        return NextResponse.json(
          {
            error: `Deployment failed: Vercel needs access to the GitHub repository '${project.githubRepoName}'. Please ensure the Vercel GitHub App has permission.`,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `Failed to trigger deployment: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      `[Vercel Deploy API] Error: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}