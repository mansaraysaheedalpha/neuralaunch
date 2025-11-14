// src/lib/agents/tools/filesystem-tool.ts
/**
 * FileSystem Tool
 * Provides file read/write operations via SandboxService
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { SandboxService } from "@/lib/services/sandbox-service";

type FileOperation = "read" | "write";

type FileSystemParams =
  | { operation: "read"; path: string }
  | { operation: "write"; path: string; content: string };

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

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

  private parseParams(
    raw: Record<string, unknown>
  ): ParseResult<FileSystemParams> {
    const operationValue = raw.operation;
    const pathValue = raw.path;

    if (typeof operationValue !== "string") {
      return { ok: false, error: "Missing filesystem operation" };
    }

    const normalizedOperation = operationValue.toLowerCase();
    if (!this.isSupportedOperation(normalizedOperation)) {
      return {
        ok: false,
        error: 'Operation must be "read" or "write"',
      };
    }

    if (typeof pathValue !== "string" || pathValue.trim().length === 0) {
      return { ok: false, error: "Path must be a non-empty string" };
    }

    const trimmedPath = pathValue.trim();

    const contentValue = raw.content;
    if (
      normalizedOperation === "write" &&
      (typeof contentValue !== "string" || contentValue.length === 0)
    ) {
      return { ok: false, error: "Content is required when writing a file" };
    }

    if (normalizedOperation === "write") {
      return {
        ok: true,
        value: {
          operation: "write",
          path: trimmedPath,
          content: contentValue as string,
        },
      };
    }

    return {
      ok: true,
      value: {
        operation: "read",
        path: trimmedPath,
      },
    };
  }

  private isSupportedOperation(value: string): value is FileOperation {
    return value === "read" || value === "write";
  }

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const parsedParams = this.parseParams(params);
    if (!parsedParams.ok) {
      return { success: false, error: parsedParams.error };
    }

    const { operation, path, content } = parsedParams.value;
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
            content: result.content ?? "",
            size: result.content ? Buffer.byteLength(result.content, "utf8") : 0,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      } else if (operation === "write") {
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
            size: result.size ?? Buffer.byteLength(content, "utf8"),
            lines: content.split("\n").length,
          },
          metadata: {
            executionTime: Date.now() - startTime,
          },
        };
      } else {
        return {
          success: false,
          error: "Unhandled filesystem operation",
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
