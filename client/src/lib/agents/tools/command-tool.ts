// src/lib/agents/tools/command-tool.ts
/**
 * Command Tool
 * Executes shell commands in the sandbox
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { SandboxService } from "@/lib/services/sandbox-service";

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface CommandParams {
  command: string;
  timeout: number;
}

export class CommandTool extends BaseTool {
  name = "command";
  description = "Execute shell commands in the sandbox environment";

  parameters: ToolParameter[] = [
    {
      name: "command",
      type: "string",
      description: "Shell command to execute",
      required: true,
    },
    {
      name: "timeout",
      type: "number",
      description: "Timeout in seconds (default: 300)",
      required: false,
      default: 300,
    },
  ];

  // Dangerous commands that should be blocked
  private readonly DANGEROUS_COMMANDS = [
    "rm -rf /",
    "rm -rf *",
    "del /f",
    "format",
    "DROP DATABASE",
    "DROP TABLE",
    "> /dev/sda",
    "dd if=/dev/zero",
    "fork bomb",
    ":(){ :|:& };:",
  ];

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const parsedParams = this.parseParams(params);
    if (!parsedParams.ok) {
      return { success: false, error: parsedParams.error };
    }

    const { command, timeout } = parsedParams.value;
    const { projectId, userId } = context;

    // Security: Check for dangerous commands
    if (this.isDangerous(command)) {
      this.logError("Blocked dangerous command", command);
      return {
        success: false,
        error: "Command blocked for security reasons",
      };
    }

    const startTime = Date.now();

    try {
      this.logExecution("Executing command", { command, timeout });

      const result = await SandboxService.execCommand(
        projectId,
        userId,
        command,
        timeout
      );

      return {
        success: result.status === "success",
        data: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          command,
        },
        error: result.status === "error" ? result.stderr : undefined,
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.logError("Command execution", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private parseParams(raw: Record<string, unknown>): ParseResult<CommandParams> {
    const { command, timeout } = raw;
    if (typeof command !== "string" || command.trim() === "") {
      return { ok: false, error: "Command must be a non-empty string" };
    }

    const trimmedCommand = command.trim();

    let parsedTimeout = 300;
    if (typeof timeout === "number" && Number.isFinite(timeout)) {
      parsedTimeout = timeout;
    }

    return {
      ok: true,
      value: {
        command: trimmedCommand,
        timeout: Math.max(1, Math.floor(parsedTimeout)),
      },
    };
  }

  /**
   * Check if command is dangerous
   */
  private isDangerous(command: string): boolean {
    const lowerCommand = command.toLowerCase();
    return this.DANGEROUS_COMMANDS.some((dangerous) =>
      lowerCommand.includes(dangerous.toLowerCase())
    );
  }

  protected getExamples(): string[] {
    return [
      '// Install packages\n{ "command": "npm install zod" }',
      '// Run tests\n{ "command": "npm test", "timeout": 120 }',
      '// Check TypeScript\n{ "command": "npx tsc --noEmit" }',
      '// List files\n{ "command": "ls -la src/" }',
    ];
  }
}
