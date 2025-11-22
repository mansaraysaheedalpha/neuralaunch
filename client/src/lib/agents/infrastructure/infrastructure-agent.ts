// src/lib/agents/infrastructure/infrastructure-agent.ts
/**
 * Infrastructure Agent - WITH FIX MODE
 * Now supports fixing infrastructure issues
 */

import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { AI_MODELS } from "@/lib/models";
import { logger } from "@/lib/logger";
import { toError, toLogContext } from "@/lib/error-utils";

interface InfrastructureIssue {
  file: string;
  severity: string;
  message: string;
  suggestion: string;
}

export class InfrastructureAgent extends BaseAgent {
  constructor() {
    super({
      name: "InfrastructureAgent",
      category: "execution",
      description:
        "Generic infrastructure setup - adapts to any tech stack and task requirements",
      supportedTaskTypes: ["infrastructure", "devops", "deployment_config"],
      requiredTools: [
        "filesystem",
        "command",
        "web_search", // ✅ Enabled
        "code_analysis",
        "context_loader",
      ],
      modelName: AI_MODELS.CLAUDE,
    });
  }

  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { taskId: _taskId, projectId, userId, taskDetails, context } = input;

    const isFixMode = taskDetails.mode === "fix";

    if (isFixMode) {
      return await this.executeFixMode(input);
    }

    logger.info(`[${this.config.name}] Starting infrastructure task`, {
      _taskId,
      title: taskDetails.title,
    });

    try {
      // ✅ 1. Load Context (Boosted)
      await this.loadProjectContextInternal(input);

      // ✅ 2. Conduct Research (Optional)
      const researchNotes = await this.conductResearch(input);

      // ✅ 3. Generate Config
      const prompt = this.buildTaskPrompt(taskDetails, context, researchNotes);

      const responseText = await this.generateContent(
        prompt,
        undefined,
        false, // Tools disabled to protect JSON
        { projectId, userId }
      );

      const generatedFiles = this.parseGeneratedFiles(responseText);

      // ✅ 4. Write Files (with secret sanitization)
      const writtenFiles: string[] = [];
      const sanitizationWarnings: string[] = [];

      for (const file of generatedFiles) {
        // ✅ SECURITY FIX: Sanitize secrets before writing
        const { sanitizedContent, warnings } = this.sanitizeSecrets(file.path, file.content);

        if (warnings.length > 0) {
          sanitizationWarnings.push(...warnings);
          logger.warn(`[${this.config.name}] Sanitized secrets in ${file.path}`, { warnings });
        }

        await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: file.path,
            content: sanitizedContent,
          },
          { projectId, userId }
        );
        writtenFiles.push(file.path);
      }

      logger.info(`[${this.config.name}] Infrastructure task complete`, {
        filesCreated: writtenFiles.length,
      });

      return {
        success: true,
        message: `Created ${writtenFiles.length} infrastructure files`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: writtenFiles,
          filesData: generatedFiles,
        },
      };
    } catch (error) {
      logger.error(
        `[${this.config.name}] Infrastructure task failed`,
        toError(error)
      );

      return {
        success: false,
        message: "Infrastructure task failed",
        iterations: 1,
        durationMs: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * ✅ NEW: Execute in fix mode for infrastructure
   */
  private async executeFixMode(
    input: AgentExecutionInput
  ): Promise<AgentExecutionOutput> {
    const { taskId: _taskId, projectId, userId, taskDetails, context } = input;

    try {
      // Step 1: Load infrastructure files that need fixing
      const isInfrastructureIssue = (
        value: unknown
      ): value is InfrastructureIssue => {
        if (typeof value !== "object" || value === null) return false;
        const v = value as Record<string, unknown>;
        return (
          typeof v.file === "string" &&
          typeof v.severity === "string" &&
          typeof v.message === "string" &&
          typeof v.suggestion === "string"
        );
      };

      const rawIssues: unknown = taskDetails.issuesToFix;
      const issuesToFix: InfrastructureIssue[] = Array.isArray(rawIssues)
        ? (rawIssues as unknown[]).filter(isInfrastructureIssue)
        : [];

      const filesToFix = issuesToFix.map((issue) => issue.file);
      const uniqueFiles = Array.from(new Set(filesToFix));

      logger.info(
        `[${this.config.name}] Loading ${uniqueFiles.length} config files to fix`
      );

      const existingFiles = await this.loadFilesToFix(
        projectId,
        userId,
        uniqueFiles
      );

      // Step 2: Generate fixes
      const attemptNum =
        typeof taskDetails.attempt === "number"
          ? taskDetails.attempt
          : Number(taskDetails.attempt) || 1;

      const fixPrompt = this.buildInfraFixPrompt(
        issuesToFix,
        existingFiles,
        attemptNum,
        context
      );

      // ✅ FIXED: Disable tools for fix generation (was incorrectly enabled)
      const responseText = await this.generateContent(
        fixPrompt,
        undefined, // No system instruction
        false, // DISABLE tools - direct JSON output prevents empty responses
        {
          projectId,
          userId,
        }
      );

      const fixes = this.parseGeneratedFiles(responseText);

      if (!fixes || fixes.length === 0) {
        return {
          success: false,
          message: "Failed to generate infrastructure fixes",
          iterations: 1,
          durationMs: 0,
          error: "AI could not generate fixes",
        };
      }

      // Step 3: Apply fixes
      const writtenFiles: string[] = [];
      for (const file of fixes) {
        await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: file.path,
            content: file.content,
          },
          { projectId, userId }
        );
        writtenFiles.push(file.path);
      }

      const issuesCount = issuesToFix.length;
      logger.info(`[${this.config.name}] Infrastructure fixes applied`, {
        filesFixed: writtenFiles.length,
        issuesAddressed: issuesCount,
      });

      return {
        success: true,
        message: `Fixed ${issuesCount} infrastructure issues`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: writtenFiles,
          issuesFixed: issuesCount,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `[${this.config.name}] Infrastructure fix failed`,
        toError(error)
      );

      return {
        success: false,
        message: "Infrastructure fix attempt failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Load infrastructure files to fix
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

        if (
          result.success &&
          result.data &&
          typeof result.data === "object" &&
          "content" in result.data
        ) {
          const content = (result.data as { content: unknown }).content;
          if (typeof content === "string") {
            files.push({
              path: filePath,
              content: content,
            });
          }
        }
      } catch (error) {
        logger.warn(
          `[${this.config.name}] Failed to load file: ${filePath}`,
          toLogContext(error)
        );
      }
    }

    return files;
  }

  /**
   * Build infrastructure fix prompt
   */
  /**
   * Build infrastructure fix prompt
   */
  private buildInfraFixPrompt(
    issues: InfrastructureIssue[],
    existingFiles: Array<{ path: string; content: string }>,
    attempt: number,
    context: Record<string, unknown>
  ): string {
    const issuesSummary = issues
      .map(
        (issue: InfrastructureIssue, i: number): string => `
**Issue ${i + 1}:**
- File: ${issue.file}
- Severity: ${issue.severity}
- Problem: ${issue.message}
- Suggestion: ${issue.suggestion}
    `
      )
      .join("\n");

    const filesSummary = existingFiles
      .map(
        (file: { path: string; content: string }): string => `
**File: ${file.path}**
\`\`\`
${file.content}
\`\`\`
    `
      )
      .join("\n");

    return `
You are the Infrastructure Agent in FIX MODE. Fix configuration issues found by the Critic Agent.

**FIX ATTEMPT: ${attempt}**

**ISSUES TO FIX:**
${issuesSummary}

**EXISTING CONFIG FILES:**
${filesSummary}

**TECH STACK:**
\`\`\`json
${JSON.stringify(context.techStack, null, 2)}
\`\`\`

**FIX STRATEGIES:**

For **Docker Issues**:
- Fix base image vulnerabilities (use specific versions)
- Add proper USER directive (don't run as root)
- Multi-stage builds for smaller images
- Proper .dockerignore

For **CI/CD Issues**:
- Fix workflow syntax errors
- Add proper environment variables
- Correct deployment steps
- Add security scanning

For **Environment Variable Issues**:
- Remove hardcoded secrets
- Add all required variables to .env.example
- Document variable purposes
- Use proper naming conventions

For **Security Issues**:
- Remove exposed secrets
- Add proper permissions
- Use secure defaults
- Add security headers

**OUTPUT FORMAT (JSON only):**

\`\`\`json
{
  "files": [
    {
      "path": "exact/path/to/config",
      "content": "COMPLETE FIXED FILE CONTENT",
      "description": "What was fixed"
    }
  ],
  "explanation": "Summary of infrastructure fixes applied"
}
\`\`\`

Generate the fixed infrastructure configurations now.
`.trim();
  }

  /**
   * ✅ Conduct Research for DevOps Best Practices
   */
  private async conductResearch(
    input: AgentExecutionInput
  ): Promise<string | null> {
    const { taskDetails, projectId, userId } = input;

    // Infrastructure tasks almost always benefit from looking up latest versions/configs
    // e.g. "Latest node 20 dockerfile best practices"
    const query = `${taskDetails.title} ${taskDetails.description} configuration best practices example`;

    logger.info(`[${this.config.name}] Researching: ${query}`);

    try {
      const result = await this.executeTool(
        "web_search",
        { query, maxResults: 2 },
        { projectId, userId }
      );

      if (result.success && result.data) {
        const searchData = result.data as {
          results: Array<{ title: string; description: string }>;
        };
        const summary = searchData.results
          .map((r) => `Title: ${r.title}\nInfo: ${r.description}`)
          .join("\n\n");
        return `\n**🔍 DEVOPS RESEARCH (Best Practices):**\n${summary}\n`;
      }
    } catch {
      logger.warn(`[${this.config.name}] Research failed, using defaults.`);
    }
    return null;
  }

  /**
   * Build AI prompt based on SPECIFIC task requirements
   * ✅ Updated to accept Research Notes
   */
  private buildTaskPrompt(
    taskDetails: AgentExecutionInput["taskDetails"],
    context: Record<string, unknown>,
    researchNotes: string | null
  ): string {
    type TechDetails = { files?: string[]; technologies?: string[] };
    const techDetailsUnknown: unknown = taskDetails.technicalDetails;

    let filesList = "Determine based on task";
    let technologiesList = "Determine from context";

    if (typeof techDetailsUnknown === "object" && techDetailsUnknown !== null) {
      const td = techDetailsUnknown as Partial<TechDetails>;
      if (Array.isArray(td.files)) filesList = td.files.join(", ");
      if (Array.isArray(td.technologies))
        technologiesList = td.technologies.join(", ");
    }

    return `
You are an expert DevOps engineer. Generate infrastructure configuration files for this SPECIFIC task.

**TASK:**
Title: ${taskDetails.title}
Description: ${taskDetails.description}

**FILES TO CREATE:**
${filesList}

**TECHNOLOGIES:**
${technologiesList}

${researchNotes ? researchNotes : ""}

**TECH STACK:**
${JSON.stringify(context.techStack, null, 2)}

**ARCHITECTURE:**
${JSON.stringify(context.architecture, null, 2)}

**EXISTING FILES:**
${context._existingFiles ? `Files already exist: ${Object.keys(context._existingFiles).join(", ")}` : "Starting fresh"}

**OUTPUT FORMAT (JSON only):**

\`\`\`json
{
  "files": [
    {
      "path": "exact/path/to/file",
      "content": "complete file content here",
      "description": "Brief description"
    }
  ],
  "explanation": "Brief explanation"
}
\`\`\`
`.trim();
  }

  /**
   * Parse AI response into file objects
   */
  private parseGeneratedFiles(responseText: string): Array<{
    path: string;
    content: string;
    description: string;
  }> {
    try {
      const cleaned = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const parsed = JSON.parse(cleaned) as {
        files?: Array<{ path: string; content: string; description: string }>;
      };

      return parsed.files || [];
    } catch (error) {
      logger.error(
        `[${this.config.name}] Failed to parse AI response`,
        toError(error)
      );
      throw new Error("Failed to parse infrastructure configuration");
    }
  }

  /**
   * ✅ SECURITY FIX: Sanitize hardcoded secrets in generated files
   * AI often hallucinates default passwords like "password123" or "secret_key"
   * This replaces them with environment variable references
   */
  private sanitizeSecrets(
    filePath: string,
    content: string
  ): { sanitizedContent: string; warnings: string[] } {
    const warnings: string[] = [];
    let sanitizedContent = content;

    // Patterns that indicate secret values (key=value patterns)
    const secretPatterns = [
      // PASSWORD patterns
      { regex: /(\b(?:PASSWORD|PASSWD|PASS)\s*[=:]\s*)["']?([^"'\s\n]{4,})["']?/gi, envVar: "DB_PASSWORD" },
      { regex: /(POSTGRES_PASSWORD\s*[=:]\s*)["']?([^"'\s\n]{4,})["']?/gi, envVar: "POSTGRES_PASSWORD" },
      { regex: /(MYSQL_PASSWORD\s*[=:]\s*)["']?([^"'\s\n]{4,})["']?/gi, envVar: "MYSQL_PASSWORD" },
      { regex: /(MYSQL_ROOT_PASSWORD\s*[=:]\s*)["']?([^"'\s\n]{4,})["']?/gi, envVar: "MYSQL_ROOT_PASSWORD" },
      { regex: /(REDIS_PASSWORD\s*[=:]\s*)["']?([^"'\s\n]{4,})["']?/gi, envVar: "REDIS_PASSWORD" },

      // SECRET/KEY patterns
      { regex: /(\b(?:SECRET_KEY|SECRET)\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "SECRET_KEY" },
      { regex: /(JWT_SECRET\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "JWT_SECRET" },
      { regex: /(API_KEY\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "API_KEY" },
      { regex: /(API_SECRET\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "API_SECRET" },
      { regex: /(AUTH_SECRET\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "AUTH_SECRET" },
      { regex: /(ENCRYPTION_KEY\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "ENCRYPTION_KEY" },
      { regex: /(NEXTAUTH_SECRET\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "NEXTAUTH_SECRET" },

      // TOKEN patterns
      { regex: /(ACCESS_TOKEN\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "ACCESS_TOKEN" },
      { regex: /(REFRESH_TOKEN\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "REFRESH_TOKEN" },
      { regex: /(GITHUB_TOKEN\s*[=:]\s*)["']?([^"'\s\n]{8,})["']?/gi, envVar: "GITHUB_TOKEN" },
    ];

    // Common weak/default passwords to always flag
    const weakPasswords = [
      "password", "password123", "123456", "admin", "root", "secret",
      "changeme", "default", "test", "example", "12345678", "qwerty",
    ];

    // Determine the environment variable syntax based on file type
    const isYaml = filePath.endsWith(".yml") || filePath.endsWith(".yaml");
    const isDockerCompose = filePath.includes("docker-compose") || filePath.includes("compose.");
    const isEnvFile = filePath.endsWith(".env") || filePath.includes(".env.");
    const isDockerfile = filePath.toLowerCase().includes("dockerfile");

    const getEnvRef = (varName: string): string => {
      if (isDockerCompose || isYaml) return `\${${varName}}`;
      if (isDockerfile) return `\${${varName}}`;
      if (isEnvFile) return `\${${varName}}`; // Will be replaced by actual env var at runtime
      return `process.env.${varName}`;
    };

    // Check for weak passwords in any context
    for (const weakPwd of weakPasswords) {
      const weakPwdRegex = new RegExp(`["']${weakPwd}["']`, "gi");
      if (weakPwdRegex.test(sanitizedContent)) {
        warnings.push(`Found weak/default password "${weakPwd}" in ${filePath}`);
      }
    }

    // Apply secret pattern replacements
    for (const { regex, envVar } of secretPatterns) {
      const matches = sanitizedContent.match(regex);
      if (matches) {
        for (const match of matches) {
          // Extract the value part
          const valueMatch = match.match(/[=:]\s*["']?([^"'\s\n]+)["']?$/i);
          if (valueMatch) {
            const value = valueMatch[1];

            // Skip if already an env var reference
            if (value.startsWith("${") || value.startsWith("process.env.")) continue;

            // Skip if it's a placeholder like <your-password>
            if (value.startsWith("<") && value.endsWith(">")) continue;

            // Replace with env var reference
            const replacement = match.replace(valueMatch[0], `=${getEnvRef(envVar)}`);
            sanitizedContent = sanitizedContent.replace(match, replacement);
            warnings.push(`Replaced hardcoded ${envVar} with environment variable reference`);
          }
        }
      }
    }

    return { sanitizedContent, warnings };
  }

  /**
   * ✅ FIXED: Token-efficient context loading
   * Reduced from 50 files/1MB to 10 files/200KB
   * Infrastructure tasks typically need less code context than frontend/backend
   */
  private async loadProjectContextInternal(
    input: AgentExecutionInput
  ): Promise<void> {
    try {
      const contextResult = await this.executeTool(
        "context_loader",
        {
          operation: "smart_load",
          taskDescription: input.taskDetails.title,
          maxFiles: 10,      // ✅ REDUCED from 50
          maxSize: 200000,   // ✅ REDUCED from 1MB to 200KB
        },
        {
          projectId: input.projectId,
          userId: input.userId,
        }
      );

      if (contextResult.success && contextResult.data) {
        const data = contextResult.data as {
          existingFiles?: Record<string, string>;
          structure?: unknown;
          dependencies?: unknown;
        };
        input.context._existingFiles = data.existingFiles || {};
        input.context._projectStructure = data.structure;
        input.context._dependencies = data.dependencies;
      }
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to load project context`,
        toLogContext(error)
      );
    }
  }
}

export const infrastructureAgent = new InfrastructureAgent();
