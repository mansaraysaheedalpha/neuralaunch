// src/lib/agents/github/github-agent.ts
/**
 * GitHub Agent
 * Manages repository creation, branch management, and pull request workflow
 * This is the FIRST agent to run - sets up the foundation for all code execution
 */

import { Octokit } from "@octokit/rest";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface GitHubSetupInput {
  projectId: string;
  userId: string;
  conversationId: string;
  projectName: string;
  description?: string;
  isPrivate?: boolean;
  githubToken: string;
}

export interface GitHubSetupOutput {
  success: boolean;
  message: string;
  repoUrl?: string;
  repoName?: string;
  defaultBranch?: string;
}

export interface CreatePRInput {
  projectId: string;
  repoName: string; // format: "owner/repo"
  branchName: string;
  title: string;
  description: string;
  githubToken: string;
  baseBranch?: string; // defaults to 'main'
}

export interface CreatePROutput {
  success: boolean;
  message: string;
  prUrl?: string;
  prNumber?: number;
}

export interface MergePRInput {
  projectId: string;
  repoName: string;
  prNumber: number;
  githubToken: string;
  mergeMethod?: "merge" | "squash" | "rebase";
}

// ==========================================
// GITHUB AGENT CLASS
// ==========================================

export class GitHubAgent {
  public readonly name = "GitHubAgent";
  public readonly phase = "infrastructure_setup";

  /**
   * Initialize GitHub repository for the project
   * This MUST run before any execution agents
   */
  async setupRepository(input: GitHubSetupInput): Promise<GitHubSetupOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Setting up GitHub repository for project ${input.projectId}`
    );

    try {
      const octokit = new Octokit({ auth: input.githubToken });

      // Step 1: Get authenticated user
      const { data: user } = await octokit.rest.users.getAuthenticated();
      logger.info(`[${this.name}] Authenticated as ${user.login}`);

      // Step 2: Generate safe repo name
      const safeRepoName = this.generateRepoName(input.projectName);

      // Step 3: Check if repo already exists
      try {
        await octokit.rest.repos.get({
          owner: user.login,
          repo: safeRepoName,
        });

        // Repo exists, return existing info
        const repoUrl = `https://github.com/${user.login}/${safeRepoName}`;
        logger.info(`[${this.name}] Repository already exists: ${repoUrl}`);

        return {
          success: true,
          message: "Repository already exists",
          repoUrl,
          repoName: `${user.login}/${safeRepoName}`,
          defaultBranch: "main",
        };
      } catch (error: any) {
        if (error.status !== 404) {
          throw error;
        }
        // Repo doesn't exist, continue to create it
      }

      // Step 4: Create repository
      logger.info(`[${this.name}] Creating repository: ${safeRepoName}`);

      const { data: repo } =
        await octokit.rest.repos.createForAuthenticatedUser({
          name: safeRepoName,
          description:
            input.description ||
            `Built with NeuraLaunch - ${input.projectName}`,
          private: input.isPrivate ?? true, // Private by default
          auto_init: true, // Initialize with README
          gitignore_template: "Node", // Add Node.js .gitignore
        });

      logger.info(`[${this.name}] Repository created: ${repo.html_url}`);

      // Step 5: Set up branch protection for main (optional but recommended)
      try {
        await octokit.rest.repos.updateBranchProtection({
          owner: user.login,
          repo: safeRepoName,
          branch: "main",
          required_status_checks: null,
          enforce_admins: false,
          required_pull_request_reviews: null,
          restrictions: null,
          required_linear_history: false,
          allow_force_pushes: false,
          allow_deletions: false,
        });
        logger.info(`[${this.name}] Branch protection enabled for main`);
      } catch (error) {
        logger.warn(
          `[${this.name}] Could not enable branch protection:`,
          error
        );
        // Non-fatal, continue
      }

      // Step 6: Store repo info in database
      await this.storeRepoInfo(
        input.projectId,
        repo.html_url,
        `${user.login}/${safeRepoName}`
      );

      // Step 7: Log execution
      const duration = Date.now() - startTime;
      await this.logExecution(
        input.projectId,
        input,
        {
          repoUrl: repo.html_url,
          repoName: `${user.login}/${safeRepoName}`,
        },
        true,
        duration
      );

      return {
        success: true,
        message: "Repository created successfully",
        repoUrl: repo.html_url,
        repoName: `${user.login}/${safeRepoName}`,
        defaultBranch: "main",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.name}] Repository setup failed:`, error);

      const duration = Date.now() - startTime;
      await this.logExecution(
        input.projectId,
        input,
        null,
        false,
        duration,
        errorMessage
      );

      return {
        success: false,
        message: `Repository setup failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Create a pull request for a feature branch
   */
  async createPullRequest(input: CreatePRInput): Promise<CreatePROutput> {
    logger.info(`[${this.name}] Creating PR for branch ${input.branchName}`);

    try {
      const octokit = new Octokit({ auth: input.githubToken });
      const [owner, repo] = input.repoName.split("/");

      // Check if PR already exists
      const { data: existingPRs } = await octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${input.branchName}`,
        state: "open",
      });

      if (existingPRs.length > 0) {
        const existingPR = existingPRs[0];
        logger.info(`[${this.name}] PR already exists: ${existingPR.html_url}`);

        return {
          success: true,
          message: "Pull request already exists",
          prUrl: existingPR.html_url,
          prNumber: existingPR.number,
        };
      }

      // Create new PR
      const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: input.title,
        body: input.description,
        head: input.branchName,
        base: input.baseBranch || "main",
      });

      logger.info(`[${this.name}] PR created: ${pr.html_url}`);

      return {
        success: true,
        message: "Pull request created successfully",
        prUrl: pr.html_url,
        prNumber: pr.number,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.name}] PR creation failed:`, error);

      return {
        success: false,
        message: `PR creation failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Merge an approved pull request
   */
  async mergePullRequest(
    input: MergePRInput
  ): Promise<{ success: boolean; message: string }> {
    logger.info(`[${this.name}] Merging PR #${input.prNumber}`);

    try {
      const octokit = new Octokit({ auth: input.githubToken });
      const [owner, repo] = input.repoName.split("/");

      // Merge the PR
      await octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: input.prNumber,
        merge_method: input.mergeMethod || "squash",
      });

      logger.info(`[${this.name}] PR #${input.prNumber} merged successfully`);

      return {
        success: true,
        message: "Pull request merged successfully",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.name}] PR merge failed:`, error);

      return {
        success: false,
        message: `PR merge failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Comment on a pull request (for feedback from Critic Agent)
   */
  async commentOnPR(
    repoName: string,
    prNumber: number,
    comment: string,
    githubToken: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const octokit = new Octokit({ auth: githubToken });
      const [owner, repo] = repoName.split("/");

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment,
      });

      logger.info(`[${this.name}] Comment added to PR #${prNumber}`);

      return {
        success: true,
        message: "Comment added successfully",
      };
    } catch (error) {
      logger.error(`[${this.name}] Failed to comment on PR:`, error);

      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Generate safe repository name from project name
   */
  private generateRepoName(projectName: string): string {
    return projectName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Remove duplicate hyphens
      .substring(0, 100); // Limit length
  }

  /**
   * Store repository info in database
   */
  private async storeRepoInfo(
    projectId: string,
    repoUrl: string,
    repoName: string
  ): Promise<void> {
    await prisma.projectContext.update({
      where: { projectId },
      data: {
        codebase: {
          githubRepoUrl: repoUrl,
          githubRepoName: repoName,
          defaultBranch: "main",
        } as any,
      },
    });

    logger.info(`[${this.name}] Stored repo info in ProjectContext`);
  }

  /**
   * Log execution to AgentExecution table
   */
  private async logExecution(
    projectId: string,
    input: any,
    output: any,
    success: boolean,
    durationMs: number,
    error?: string
  ): Promise<void> {
    try {
      await prisma.agentExecution.create({
        data: {
          projectId,
          agentName: this.name,
          phase: this.phase,
          input: input as any,
          output: output as any,
          success,
          durationMs,
          error,
        },
      });
    } catch (logError) {
      logger.error(`[${this.name}] Failed to log execution:`, logError);
    }
  }

  /**
   * Health check
   */
  async healthCheck(githubToken: string): Promise<boolean> {
    try {
      const octokit = new Octokit({ auth: githubToken });
      await octokit.rest.users.getAuthenticated();
      return true;
    } catch {
      return false;
    }
  }
}

// ==========================================
// EXPORT SINGLETON INSTANCE
// ==========================================

export const githubAgent = new GitHubAgent();
