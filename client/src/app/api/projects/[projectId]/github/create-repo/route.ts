//src/app/api/projects/[projectId]/github/create-repo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Octokit } from "@octokit/rest"; // GitHub API client
import { RequestError } from "@octokit/request-error";
import { z } from "zod";
import { logger } from "@/lib/logger";

// Zod schema for the request body (optional: allow user to suggest a repo name)
const createRepoSchema = z.object({
  repoName: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, "Invalid repo name characters.") // Basic validation
    .optional(), // Make it optional, we can generate one
});

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // 1. --- Authentication & Authorization ---
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { projectId } = params;

    // Fetch project and verify ownership
    const project = await prisma.landingPage.findFirst({
      where: { id: projectId, userId: userId },
      select: { id: true, title: true, githubRepoUrl: true }, // Select needed fields
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or forbidden" },
        { status: 404 }
      );
    }
    // Prevent creating repo if one already exists for this project
    if (project.githubRepoUrl) {
      return NextResponse.json(
        {
          error: "GitHub repository already exists for this project.",
          repoUrl: project.githubRepoUrl,
        },
        { status: 409 }
      ); // 409 Conflict
    }

    // 2. --- Input Validation (Optional Repo Name) ---
    let requestedRepoName: string | undefined;
    try {
      const body: unknown = await req.json();
      const validation = createRepoSchema.safeParse(body);
      if (validation.success) {
        requestedRepoName = validation.data.repoName;
      } else {
        // Ignore invalid repoName, proceed with default
        logger.warn(
          `[GitHub Create Repo] Invalid repoName provided for ${projectId}. Using default.`
        );
      }
    } catch {
      // No body provided or not JSON, proceed with default name
    }

    // Generate a default repo name based on project title if not provided/valid
    const repoName =
      requestedRepoName ||
      project.title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 50) ||
      `neuralaunch-project-${projectId}`;

    // 3. --- Fetch GitHub Access Token ---
    const githubAccount = await prisma.account.findFirst({
      where: {
        userId: userId,
        provider: "github",
      },
      select: { access_token: true },
    });

    if (!githubAccount?.access_token) {
      logger.error(
        `[GitHub Create Repo] GitHub access token not found for user ${userId} on project ${projectId}.`
      );
      return NextResponse.json(
        {
          error:
            "GitHub account not connected or token missing. Please reconnect your GitHub account.",
        },
        { status: 400 }
      );
    }
    const accessToken = githubAccount.access_token;

    // 4. --- Call GitHub API using Octokit ---
    const octokit = new Octokit({ auth: accessToken });

    logger.info(
      `[GitHub Create Repo] Attempting to create repository '${repoName}' for user ${userId}, project ${projectId}.`
    );

    let repoFullName: string;
    let repoHtmlUrl: string;

    try {
      const response = await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: `Codebase for NeuraLaunch project: ${project.title}`,
        private: true, // Create as a private repository
        auto_init: false, // Don't initialize with README yet, agent will push code
      });

      const status: number = response.status;

      if (status !== 201) {
        // 201 Created is the expected success status
        throw new Error(`GitHub API returned status ${status}`);
      }

      repoFullName = response.data.full_name; // e.g., "username/repo-name"
      repoHtmlUrl = response.data.html_url; // e.g., "https://github.com/username/repo-name"

      logger.info(
        `[GitHub Create Repo] Successfully created repository: ${repoHtmlUrl}`
      );
    } catch (error: unknown) {
      logger.error(
        `[GitHub Create Repo] Failed to create repository '${repoName}' for project ${projectId}:`,
        error instanceof Error ? error : undefined
      );
      let message = "Failed to create GitHub repository.";
      
      if (error instanceof RequestError) {
        if (
          error.status === 422 &&
          error.message?.includes("name already exists")
        ) {
          message = `Repository name '${repoName}' already exists on your GitHub account. Try a different name.`;
          return NextResponse.json({ error: message }, { status: 409 }); // 409 Conflict
        } else if (error.status === 401) {
          message =
            "Invalid GitHub credentials. Please reconnect your GitHub account.";
          // Optionally: Mark the token as invalid in your DB?
          return NextResponse.json({ error: message }, { status: 401 });
        }
        // Use the error message from Octokit if available
        message = error.message || message;
        return NextResponse.json(
          { error: message, details: String(error) },
          { status: 500 }
        );
      }
  
      if (error instanceof Error) {
        message = error.message || message;
      }
      return NextResponse.json(
        { error: message, details: String(error) },
        { status: 500 }
      );
    }

    // 5. --- Save Repository Info to Database ---
    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        githubRepoUrl: repoHtmlUrl,
        githubRepoName: repoFullName,
      },
    });

    // 6. --- Return Success Response ---
    return NextResponse.json(
      {
        message: "GitHub repository created successfully.",
        repoUrl: repoHtmlUrl,
        repoName: repoFullName,
      },
      { status: 201 } // 201 Created
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      `[GitHub Create Repo API] Error: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
