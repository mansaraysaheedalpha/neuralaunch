// src/lib/agents/tools/filesystem-tool.ts
/**
 * FileSystem Tool
 * Provides file read/write operations via SandboxService
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { SandboxService } from "@/lib/services/sandbox-service";

export class FileSystemTool extends BaseTool {
  name = "filesystem";
  description = "Read and write files in the project workspace";

  parameters: ToolParameter[] = [
    {
      name: "operation",
      type: "string",
      description: 'Operation to perform: "read" or "write"',
      required: true,
    },
    {
      name: "path",
      type: "string",
      description: "Relative path to the file",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "File content (required for write operation)",
      required: false,
    },
  ];

  async execute(
    params: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { operation, path, content } = params;
    const { projectId, userId } = context;

    const startTime = Date.now();

    try {
      if (operation === "read") {
        this.logExecution("Reading file", { path });

        const result = await SandboxService.readFile(projectId, userId, path);

        if (result.status === "error") {
          return {
            success: false,
            error: result.message || "Failed to read file",
          };
        }

        return {
          success: true,
          data: {
            path,
            content: result.content,
            size: result.content?.length || 0,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      } else if (operation === "write") {
        if (!content) {
          return {
            success: false,
            error: "Content is required for write operation",
          };
        }

        this.logExecution("Writing file", { path, size: content.length });

        const result = await SandboxService.writeFile(
          projectId,
          userId,
          path,
          content
        );

        if (result.status === "error") {
          return {
            success: false,
            error: result.message || "Failed to write file",
          };
        }

        return {
          success: true,
          data: {
            path,
            size: result.size,
            lines: content.split("\n").length,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      } else {
        return {
          success: false,
          error: `Unknown operation: ${operation}. Use "read" or "write"`,
        };
      }
    } catch (error) {
      this.logError("File operation", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  protected getExamples(): string[] {
    return [
      '// Read a file\n{ "operation": "read", "path": "src/app/page.tsx" }',
      '// Write a file\n{ "operation": "write", "path": "src/utils/helper.ts", "content": "export const helper = () => { ... }" }',
    ];
  }
}
