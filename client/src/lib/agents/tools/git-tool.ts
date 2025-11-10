// src/lib/agents/tools/git-tool.ts
/**
 * Git Tool
 * Provides git operations via SandboxService
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { SandboxService } from "@/lib/services/sandbox-service";

export class GitTool extends BaseTool {
  name = "git";
  description = "Perform git operations: init, add, commit, branch, push";

  parameters: ToolParameter[] = [
    {
      name: "operation",
      type: "string",
      description: 'Git operation: "init", "add", "commit", "branch", "push"',
      required: true,
    },
    {
      name: "message",
      type: "string",
      description: "Commit message (for commit operation)",
      required: false,
    },
    {
      name: "branchName",
      type: "string",
      description: "Branch name (for branch/push operations)",
      required: false,
    },
    {
      name: "repoUrl",
      type: "string",
      description: "Repository URL (for push operation)",
      required: false,
    },
    {
      name: "githubToken",
      type: "string",
      description: "GitHub token (for push operation)",
      required: false,
    },
  ];

  async execute(
    params: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { operation, message, branchName, repoUrl, githubToken } = params;
    const { projectId, userId } = context;

    const startTime = Date.now();

    try {
      switch (operation) {
        case "init": {
          this.logExecution("Initializing git repository");
          const result = await SandboxService.gitInitIfNeeded(
            projectId,
            userId
          );

          return {
            success: result.success,
            data: { message: result.message },
            error: result.success ? undefined : result.details,
            metadata: { executionTime: Date.now() - startTime },
          };
        }

        case "add": {
          this.logExecution("Adding files to git");
          const result = await SandboxService.gitAddAll(projectId, userId);

          return {
            success: result.success,
            data: { message: result.message },
            error: result.success ? undefined : result.details,
            metadata: { executionTime: Date.now() - startTime },
          };
        }

        case "commit": {
          if (!message) {
            return { success: false, error: "Commit message is required" };
          }

          this.logExecution("Committing changes", { message });
          const result = await SandboxService.gitCommit(
            projectId,
            userId,
            message
          );

          return {
            success: result.success,
            data: {
              committed: result.committed,
              message: result.message,
            },
            error: result.success ? undefined : result.details,
            metadata: { executionTime: Date.now() - startTime },
          };
        }

        case "branch": {
          if (!branchName) {
            return { success: false, error: "Branch name is required" };
          }

          this.logExecution("Creating branch", { branchName });
          const result = await SandboxService.gitCreateBranch(
            projectId,
            userId,
            branchName
          );

          return {
            success: result.success,
            data: {
              branchName,
              message: result.message,
            },
            error: result.success ? undefined : result.details,
            metadata: { executionTime: Date.now() - startTime },
          };
        }

        case "push": {
          if (!branchName || !repoUrl || !githubToken) {
            return {
              success: false,
              error:
                "Branch name, repo URL, and GitHub token are required for push",
            };
          }

          this.logExecution("Pushing to remote", { branchName, repoUrl });
          const result = await SandboxService.gitPushToBranch(
            projectId,
            userId,
            repoUrl,
            githubToken,
            branchName
          );

          return {
            success: result.success,
            data: {
              branchName,
              message: result.message,
            },
            error: result.success ? undefined : result.details,
            metadata: { executionTime: Date.now() - startTime },
          };
        }

        default:
          return {
            success: false,
            error: `Unknown git operation: ${operation}`,
          };
      }
    } catch (error) {
      this.logError(`Git ${operation}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  protected getExamples(): string[] {
    return [
      '// Initialize repository\n{ "operation": "init" }',
      '// Stage all changes\n{ "operation": "add" }',
      '// Commit changes\n{ "operation": "commit", "message": "feat: add user API" }',
      '// Create branch\n{ "operation": "branch", "branchName": "feature/user-api" }',
      '// Push to remote\n{ "operation": "push", "branchName": "feature/user-api", "repoUrl": "https://github.com/user/repo", "githubToken": "ghp_..." }',
    ];
  }
}
