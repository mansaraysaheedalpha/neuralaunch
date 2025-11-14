// src/lib/agents/tools/git-tool.ts
/**
 * Git Tool
 * Provides git operations via SandboxService
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { SandboxService } from "@/lib/services/sandbox-service";

type GitOperation = "init" | "add" | "commit" | "branch" | "push";

type GitParams =
  | { operation: "init" | "add" }
  | { operation: "commit"; message: string }
  | { operation: "branch"; branchName: string }
  | {
      operation: "push";
      branchName: string;
      repoUrl: string;
      githubToken: string;
    };

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

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
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const parsedParams = this.parseParams(params);
    if (!parsedParams.ok) {
      return { success: false, error: parsedParams.error };
    }

    const { operation } = parsedParams.value;
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
          const { message } = parsedParams.value;
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
          const { branchName } = parsedParams.value;
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
          const { branchName, repoUrl, githubToken } = parsedParams.value;
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
            error: "Unhandled git operation",
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

  private parseParams(raw: Record<string, unknown>): ParseResult<GitParams> {
    const operationValue = raw.operation;
    if (typeof operationValue !== "string") {
      return { ok: false, error: "Missing git operation" };
    }

    const normalizedOperation = operationValue.toLowerCase();
    if (!this.isSupportedOperation(normalizedOperation)) {
      return { ok: false, error: "Unsupported git operation" };
    }

    switch (normalizedOperation) {
      case "init":
      case "add":
        return { ok: true, value: { operation: normalizedOperation } };

      case "commit": {
        if (typeof raw.message !== "string" || raw.message.trim().length === 0) {
          return { ok: false, error: "Commit message is required" };
        }
        return {
          ok: true,
          value: { operation: "commit", message: raw.message.trim() },
        };
      }

      case "branch": {
        if (
          typeof raw.branchName !== "string" ||
          raw.branchName.trim().length === 0
        ) {
          return { ok: false, error: "Branch name is required" };
        }
        return {
          ok: true,
          value: { operation: "branch", branchName: raw.branchName.trim() },
        };
      }

      case "push": {
        const branchName =
          typeof raw.branchName === "string" ? raw.branchName.trim() : "";
        const repoUrl =
          typeof raw.repoUrl === "string" ? raw.repoUrl.trim() : "";
        const githubToken =
          typeof raw.githubToken === "string" ? raw.githubToken.trim() : "";

        if (!branchName || !repoUrl || !githubToken) {
          return {
            ok: false,
            error: "Branch name, repo URL, and GitHub token are required for push",
          };
        }

        return {
          ok: true,
          value: { operation: "push", branchName, repoUrl, githubToken },
        };
      }

      default:
        return { ok: false, error: "Unsupported git operation" };
    }
  }

  private isSupportedOperation(value: string): value is GitOperation {
    return ["init", "add", "commit", "branch", "push"].includes(
      value as GitOperation
    );
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
