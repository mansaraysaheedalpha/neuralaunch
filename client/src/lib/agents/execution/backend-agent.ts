// src/lib/agents/execution/backend-agent-v2.ts
// src/lib/agents/execution/backend-agent-v2.ts
/**
 * Backend Agent V2 - WITH FIX MODE
 * Now supports fixing issues found by Critic Agent
 */

import { AI_MODELS } from "@/lib/models";
import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { logger } from "@/lib/logger";
import { toError, toLogContext } from "@/lib/error-utils";

export class BackendAgent extends BaseAgent {
  constructor() {
    super({
      name: "BackendAgent",
      category: "execution",
      description:
        "Specialized in backend implementation: APIs, business logic, database operations",
      supportedTaskTypes: ["backend", "api", "database", "business-logic"],
      requiredTools: [
        "filesystem",
        "git",
        "command",
        "web_search",
        "code_analysis",
        "context_loader",
        "claude_skills", // Advanced API design, business logic, and code generation
      ],
      modelName: AI_MODELS.PRIMARY,
    });
  }

  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { taskId, projectId, userId, taskDetails, context } = input;

    // ✅ Check if this is a fix request
    const isFixMode = taskDetails.mode === "fix";

    if (isFixMode) {
      logger.info(
        `[${this.config.name}] FIX MODE: Fixing issues for task "${taskDetails.originalTaskId}"`,
        {
          attempt: taskDetails.attempt,
          issuesCount: taskDetails.issuesToFix?.length || 0,
        }
      );

      return await this.executeFixMode(input);
    }

    // Normal execution mode
    logger.info(
      `[${this.config.name}] Executing backend task: "${taskDetails.title}"`
    );

    try {
      const implementation = await this.generateImplementation(input);

      if (!implementation) {
        return {
          success: false,
          message: "Failed to generate implementation",
          iterations: 1,
          durationMs: 0,
          error: "AI generation failed",
        };
      }

      const filesResult = await this.writeFiles(implementation.files, {
        projectId,
        userId,
      });

      if (!filesResult.success) {
        return {
          success: false,
          message: "Failed to write files",
          iterations: 1,
          durationMs: 0,
          error: filesResult.error,
          data: { filesCreated: filesResult.files },
        };
      }

      const commandsResult = await this.runCommands(implementation.commands, {
        projectId,
        userId,
      });

      if (!commandsResult.success) {
        return {
          success: false,
          message: "Failed to execute commands",
          iterations: 1,
          durationMs: 0,
          error: commandsResult.error,
          data: {
            filesCreated: filesResult.files,
            commandsRun: commandsResult.commands,
          },
        };
      }

      const verification = await this.verifyImplementation(
        filesResult.files,
        commandsResult.commands,
        taskDetails
      );

      if (!verification.passed) {
        return {
          success: false,
          message: "Verification failed",
          iterations: 1,
          durationMs: 0,
          error: verification.issues.join("; "),
          data: {
            filesCreated: filesResult.files,
            commandsRun: commandsResult.commands,
          },
        };
      }

      return {
        success: true,
        message: `Backend task completed: ${taskDetails.title}`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: filesResult.files,
          commandsRun: commandsResult.commands,
          explanation: implementation.explanation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.config.name}] Task execution failed`, toError(error));

      return {
        success: false,
        message: "Task execution failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * ✅ NEW: Execute in fix mode
   */
  private async executeFixMode(
    input: AgentExecutionInput
  ): Promise<AgentExecutionOutput> {
    const { taskId, projectId, userId, taskDetails, context } = input;

    try {
      // Step 1: Load the files that need fixing
      const filesToFix = taskDetails.issuesToFix.map((issue: any) => issue.file);
      const uniqueFiles = Array.from(new Set(filesToFix));

      logger.info(`[${this.config.name}] Loading ${uniqueFiles.length} files to fix`);

      const existingFiles = await this.loadFilesToFix(
        projectId,
        userId,
        uniqueFiles as string[]
      );

      // Step 2: Generate fixes using AI
      const fixPrompt = this.buildFixPrompt(
        taskDetails.issuesToFix,
        existingFiles,
        taskDetails.attempt,
        context
      );

      const result = await this.model.generateContent(fixPrompt);
      const responseText = result.response.text();

      const fixes = this.parseFixResponse(responseText);

      if (!fixes || fixes.files.length === 0) {
        return {
          success: false,
          message: "Failed to generate fixes",
          iterations: 1,
          durationMs: 0,
          error: "AI could not generate fixes",
        };
      }

      // Step 3: Apply fixes
      const filesResult = await this.writeFiles(fixes.files, {
        projectId,
        userId,
      });

      if (!filesResult.success) {
        return {
          success: false,
          message: "Failed to write fixed files",
          iterations: 1,
          durationMs: 0,
          error: filesResult.error,
          data: { filesCreated: filesResult.files },
        };
      }

      // Step 4: Run any necessary commands after fixes
      const commandsResult = await this.runCommands(fixes.commands || [], {
        projectId,
        userId,
      });

      logger.info(
        `[${this.config.name}] Fix attempt ${taskDetails.attempt} complete`,
        {
          filesFixed: filesResult.files.length,
          issuesAddressed: taskDetails.issuesToFix.length,
        }
      );

      return {
        success: true,
        message: `Fixed ${taskDetails.issuesToFix.length} issues in ${filesResult.files.length} files`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: filesResult.files,
          commandsRun: commandsResult.commands,
          issuesFixed: taskDetails.issuesToFix.length,
          fixExplanation: fixes.explanation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.config.name}] Fix mode failed`, toError(error));

      return {
        success: false,
        message: "Fix attempt failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Load existing files that need fixing
   */
  private async loadFilesToFix(
    projectId: string,
    userId: string,
    filePaths: string[]
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.executeTool(
          "filesystem",
          { operation: "read", path: filePath },
          { projectId, userId }
        );

        if (result.success && result.data?.content) {
          files.push({
            path: filePath,
            content: result.data.content,
          });
        }
      } catch (error) {
        logger.warn(
          `[${this.config.name}] Failed to load file: ${filePath}`,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    return files;
  }

  /**
   * Build fix prompt for AI
   */
  private buildFixPrompt(
    issues: any[],
    existingFiles: Array<{ path: string; content: string }>,
    attempt: number,
    context: any
  ): string {
    const issuesSummary = issues
      .map(
        (issue, i) => `
**Issue ${i + 1}:**
- File: ${issue.file}
- Line: ${issue.line || "N/A"}
- Severity: ${issue.severity}
- Category: ${issue.category}
- Problem: ${issue.message}
- Suggestion: ${issue.suggestion}
${issue.codeSnippet ? `- Code Snippet:\n\`\`\`\n${issue.codeSnippet}\n\`\`\`` : ""}
    `
      )
      .join("\n");

    const filesSummary = existingFiles
      .map(
        (file) => `
**File: ${file.path}**
\`\`\`
${file.content}
\`\`\`
    `
      )
      .join("\n");

    return `
You are the Backend Agent in FIX MODE. Your job is to fix the issues found by the Critic Agent.

**FIX ATTEMPT: ${attempt}**

**ISSUES TO FIX:**
${issuesSummary}

**EXISTING FILES (with issues):**
${filesSummary}

**TECH STACK:**
\`\`\`json
${JSON.stringify(context.techStack, null, 2)}
\`\`\`

**CRITICAL INSTRUCTIONS:**

1. **FIX ALL ISSUES** - Address every issue listed above
2. **MAINTAIN FUNCTIONALITY** - Don't break existing working code
3. **FOLLOW BEST PRACTICES** - Use the suggestions provided
4. **COMPLETE FILES** - Return the FULL fixed file content (not just patches)
5. **EXPLAIN CHANGES** - Briefly explain what you fixed and why

**FIX STRATEGIES:**

For **Security Issues** (SQL Injection, XSS, etc.):
- Use parameterized queries
- Sanitize user input
- Use environment variables for secrets
- Apply proper escaping

For **Type Safety Issues**:
- Add proper TypeScript types
- Fix type mismatches
- Add type assertions where appropriate

For **Performance Issues** (N+1 queries, etc.):
- Use batch queries
- Add proper indexing
- Optimize loops and iterations

For **Code Quality Issues**:
- Follow DRY principles
- Improve naming
- Add proper error handling
- Add documentation

**OUTPUT FORMAT (JSON only):**

\`\`\`json
{
  "files": [
    {
      "path": "exact/path/to/file.ts",
      "content": "COMPLETE FIXED FILE CONTENT HERE"
    }
  ],
  "commands": [
    "npm install <new-package> (if needed for fix)"
  ],
  "explanation": "Brief explanation of what was fixed and why"
}
\`\`\`

**IMPORTANT:**
- NO markdown code blocks around JSON
- Files must contain COMPLETE content (not diffs)
- Fix ALL issues, not just some
- Maintain backward compatibility
- Test your fixes mentally before responding

Generate the fixes now.
`.trim();
  }

  /**
   * Parse fix response from AI
   */
  private parseFixResponse(responseText: string): {
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null {
    try {
      let cleaned = responseText.trim();
      cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");

      const parsed = JSON.parse(cleaned);

      return {
        files: parsed.files || [],
        commands: parsed.commands || [],
        explanation: parsed.explanation || "No explanation provided",
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Failed to parse fix response`, 
        error instanceof Error ? error : new Error(String(error)),
        { preview: responseText.substring(0, 500) }
      );
      return null;
    }
  }

  /**
   * Generate implementation using AI
   */
  private async generateImplementation(input: AgentExecutionInput): Promise<{
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null> {
    const prompt = this.buildImplementationPrompt(input);

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      return this.parseImplementation(responseText);
    } catch (error) {
      logger.error(`[${this.config.name}] AI generation failed`, toError(error));
      return null;
    }
  }

  /**
   * Build implementation prompt
   */
  private buildImplementationPrompt(input: AgentExecutionInput): string {
    const { taskDetails, context } = input;

    return `
You are the Backend Agent, specialized in implementing backend code.

**Task:**
- Title: ${taskDetails.title}
- Description: ${taskDetails.description}
- Complexity: ${taskDetails.complexity}
- Estimated Lines: ${taskDetails.estimatedLines}

**Files to Create/Modify:**
${taskDetails.files?.map((f: string) => `- ${f}`).join("\n") || "Determine appropriate files"}

**Endpoints (if applicable):**
${taskDetails.endpoints?.map((e: string) => `- ${e}`).join("\n") || "N/A"}

**Acceptance Criteria:**
${taskDetails.acceptanceCriteria?.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

**Tech Stack:**
\`\`\`json
${JSON.stringify(context.techStack, null, 2)}
\`\`\`

**Architecture:**
\`\`\`json
${JSON.stringify(context.architecture, null, 2)}
\`\`\`

${context._memoryContext ? `**Relevant Past Experience:**\n${context._memoryContext}\n` : ""}

**Available Tools:**
${this.getToolsDescription()}

**CRITICAL REQUIREMENTS:**
1. **ATOMIC** - Implement ONLY this specific task, nothing more
2. **PRODUCTION QUALITY** - TypeScript, error handling, validation
3. **LINE LIMIT** - Stay within ${taskDetails.estimatedLines} ± 50 lines
4. **COMPLETE FILES** - Provide full, runnable code (not snippets)
5. **SECURITY** - Input validation, sanitization, authentication
6. **TESTING** - Code must be testable

**CODE STANDARDS:**
- TypeScript with strict typing
- Zod for validation
- Proper HTTP status codes (200, 201, 400, 401, 404, 500)
- Try-catch error handling
- Meaningful variable names
- JSDoc comments for functions
- No console.log in production code (use logger)

**OUTPUT FORMAT:**
Respond with ONLY valid JSON (no markdown, no explanations outside JSON):

\`\`\`json
{
  "files": [
    {
      "path": "src/app/api/users/route.ts",
      "content": "// COMPLETE FILE CONTENT HERE"
    }
  ],
  "commands": [
    "npm install zod",
    "npx prisma generate"
  ],
  "explanation": "Brief explanation of implementation"
}
\`\`\`

**IMPORTANT:**
- NO markdown code blocks around JSON
- NO text before or after JSON
- Files must be COMPLETE and RUNNABLE
- Follow the exact tech stack provided
`.trim();
  }

  /**
   * Parse AI implementation response
   */
  private parseImplementation(responseText: string): {
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null {
    try {
      // Clean response
      let cleaned = responseText.trim();
      cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");

      const parsed = JSON.parse(cleaned);

      return {
        files: parsed.files || [],
        commands: parsed.commands || [],
        explanation: parsed.explanation || "No explanation provided",
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Failed to parse AI response`, 
        error instanceof Error ? error : new Error(String(error)),
        { preview: responseText.substring(0, 500) }
      );
      return null;
    }
  }

  /**
   * Write files using filesystem tool
   */
  private async writeFiles(
    files: Array<{ path: string; content: string }>,
    context: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    files: Array<{ path: string; lines: number; success: boolean }>;
    error?: string;
  }> {
    const results: Array<{ path: string; lines: number; success: boolean }> =
      [];

    for (const file of files) {
      try {
        const result = await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: file.path,
            content: file.content,
          },
          context
        );

        results.push({
          path: file.path,
          lines: file.content.split("\n").length,
          success: result.success,
        });

        if (!result.success) {
          logger.warn(
            `[${this.config.name}] File write failed: ${file.path}`,
            { error: result.error }
          );
        }
      } catch (error) {
        logger.error(
          `[${this.config.name}] File write error: ${file.path}`,
          error instanceof Error ? error : new Error(String(error))
        );
        results.push({
          path: file.path,
          lines: 0,
          success: false,
        });
      }
    }

    const allSuccess = results.every((r) => r.success);

    return {
      success: allSuccess,
      files: results,
      error: allSuccess ? undefined : "Some files failed to write",
    };
  }

  /**
   * Run commands using command tool
   */
  private async runCommands(
    commands: string[],
    context: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    commands: Array<{ command: string; success: boolean; output: string }>;
    error?: string;
  }> {
    const results: Array<{
      command: string;
      success: boolean;
      output: string;
    }> = [];

    for (const command of commands) {
      try {
        // Skip dangerous commands
        if (this.isDangerousCommand(command)) {
          logger.warn(
            `[${this.config.name}] Skipped dangerous command: ${command}`
          );
          continue;
        }

        const result = await this.executeTool(
          "command",
          {
            command,
            timeout: 300,
          },
          context
        );

        results.push({
          command,
          success: result.success,
          output:
            result.data?.stdout || result.data?.stderr || result.error || "",
        });

        if (!result.success) {
          logger.warn(
            `[${this.config.name}] Command failed: ${command}`,
            { error: result.error }
          );
        }
      } catch (error) {
        logger.error(`[${this.config.name}] Command error: ${command}`, toError(error));
        results.push({
          command,
          success: false,
          output: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const allSuccess = results.every((r) => r.success);

    return {
      success: allSuccess,
      commands: results,
      error: allSuccess ? undefined : "Some commands failed",
    };
  }

  /**
   * Verify implementation meets requirements
   */
  private async verifyImplementation(
    files: Array<{ path: string; lines: number; success: boolean }>,
    commands: Array<{ command: string; success: boolean; output: string }>,
    taskDetails: any
  ): Promise<{
    passed: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check 1: All files created
    const failedFiles = files.filter((f) => !f.success);
    if (failedFiles.length > 0) {
      issues.push(`Failed to create ${failedFiles.length} file(s)`);
    }

    // Check 2: All commands succeeded
    const failedCommands = commands.filter((c) => !c.success);
    if (failedCommands.length > 0) {
      issues.push(`${failedCommands.length} command(s) failed`);
    }

    // Check 3: Line count within limits
    const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
    const maxLines = taskDetails.estimatedLines * 1.5; // Allow 50% buffer

    if (totalLines > maxLines) {
      issues.push(`Code too large: ${totalLines} lines (limit: ${maxLines})`);
    }

    // Check 4: Minimum lines (ensure not empty)
    if (totalLines < 10) {
      issues.push(`Code too small: ${totalLines} lines (suspicious)`);
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  }

  /**
   * Check if command is dangerous
   */
  private isDangerousCommand(command: string): boolean {
    const dangerous = [
      "rm -rf /",
      "rm -rf *",
      "del /f",
      "format",
      "DROP DATABASE",
      "DROP TABLE",
      "prisma db push", // No database access in sandbox
      "prisma migrate",
      "> /dev/",
      "dd if=",
    ];

    return dangerous.some((d) =>
      command.toLowerCase().includes(d.toLowerCase())
    );
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const backendAgent = new BackendAgent();
