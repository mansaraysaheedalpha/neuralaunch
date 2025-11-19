// src/lib/agents/quality/critic-agent.ts
/**
 * Critic Agent - Production-Grade Code Review
 *
 * CAPABILITIES:
 * - Code quality review (all major languages)
 * - Security scanning (OWASP Top 10)
 * - Performance analysis (N+1 queries, memory leaks)
 * - Best practices enforcement
 * - Type safety verification
 * - Documentation completeness
 * - Architecture pattern validation
 *
 * MULTI-LANGUAGE SUPPORT:
 * TypeScript, JavaScript, Python, Java, C#, Go, Rust, C++, PHP, Ruby
 */

import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { AI_MODELS } from "@/lib/models";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { toError } from "@/lib/error-utils";
import { ProjectContext } from "@/lib/agents/types/common";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";
export type IssueCategory =
  | "quality"
  | "security"
  | "performance"
  | "maintainability"
  | "documentation"
  | "architecture"
  | "type_safety";

export interface CodeIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  file: string;
  line?: number;
  message: string;
  suggestion: string;
  rule?: string;
  codeSnippet?: string;
}

export interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low";
  type: string; // SQL Injection, XSS, etc.
  file: string;
  line?: number;
  description: string;
  recommendation: string;
  cwe?: string; // Common Weakness Enumeration ID
  owasp?: string; // OWASP Top 10 category
}

export interface PerformanceWarning {
  severity: "high" | "medium" | "low";
  type: string; // N+1 Query, Memory Leak, etc.
  file: string;
  line?: number;
  description: string;
  impact: string;
  suggestion: string;
}

export interface ReviewScores {
  codeQuality: number;
  security: number;
  performance: number;
  maintainability: number;
  documentation: number;
}

export interface CodeStructure {
  [filePath: string]: unknown;
}

export interface LintIssue {
  file: string;
  line: number;
  severity: string;
  message: string;
  rule: string;
}

export interface StaticAnalysis {
  lintIssues: LintIssue[];
  typeErrors: LintIssue[];
}

export interface ReviewReport {
  approved: boolean;
  overallScore: number; // 0-100
  issues: CodeIssue[];
  securityFindings: SecurityFinding[];
  performanceWarnings: PerformanceWarning[];
  suggestions: string[];
  metrics: {
    codeQualityScore: number;
    securityScore: number;
    performanceScore: number;
    maintainabilityScore: number;
    documentationScore: number;
  };
  summary: string;
  mustFix: CodeIssue[]; // Critical/High severity issues
  shouldFix: CodeIssue[]; // Medium severity issues
  optional: CodeIssue[]; // Low/Info severity issues
}

export interface CriticInput extends AgentExecutionInput {
  filesToReview: string[];
  reviewType?: "full" | "security" | "performance" | "quality";
  strictMode?: boolean; // If true, fail on any high severity issues
}

// ==========================================
// CRITIC AGENT CLASS
// ==========================================

export class CriticAgent extends BaseAgent {
  // Quality thresholds
  private readonly MIN_QUALITY_SCORE = 60;
  private readonly MIN_SECURITY_SCORE = 80;
  private readonly MIN_PERFORMANCE_SCORE = 70;

  constructor() {
    super({
      name: "CriticAgent",
      category: "quality",
      description:
        "Code review, security scanning, and quality assurance for all languages",
      supportedTaskTypes: [
        "code_review",
        "security_scan",
        "performance_check",
        "quality_gate",
      ],
      requiredTools: [
        "filesystem",
        "command",
        "code_analysis",
        "context_loader",
        "web_search", // For finding security vulnerabilities
      ],
      modelName: AI_MODELS.OPENAI, // GPT-4o for best code review
    });
  }

  /**
   * Execute code review
   */
  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { taskId, projectId, userId } = input;
    const criticInput = input as CriticInput;

    logger.info(`[${this.config.name}] Starting code review`, {
      taskId,
      reviewType: criticInput.reviewType || "full",
      filesToReview: criticInput.filesToReview?.length || 0,
    });

    try {
      // Step 1: Load files to review
      const files = await this.loadFilesToReview(
        projectId,
        userId,
        criticInput.filesToReview
      );

      if (files.length === 0) {
        return {
          success: false,
          message: "No files to review",
          iterations: 1,
          durationMs: 0,
          error: "No files provided for review",
          data: {
            approved: false, // Explicitly set approved to false when no files
            report: undefined,
            filesReviewed: 0,
            criticalIssues: 0,
            recommendations: [],
          },
        };
      }

      // Step 2: Analyze code structure
      const codeAnalysis = await this.analyzeCodeStructure(
        projectId,
        userId,
        files
      );

      // Step 3: Run static analysis checks
      const staticAnalysis = await this.runStaticAnalysis(
        projectId,
        userId,
        files
      );

      // Step 4: Security scanning
      const securityFindings = await this.securityScan(
        projectId,
        userId,
        files,
        input.context
      );

      // Step 5: Performance analysis
      const performanceWarnings = await this.performanceCheck(
        projectId,
        userId,
        files,
        input.context
      );

      // Step 6: AI-powered comprehensive review
      const aiReview = await this.aiCodeReview(
        files,
        codeAnalysis,
        staticAnalysis,
        input.context
      );

      // Step 7: Compile review report
      const report = this.compileReviewReport(
        files,
        aiReview,
        staticAnalysis,
        securityFindings,
        performanceWarnings
      );

      // Step 8: Determine approval status
      const approved = this.shouldApprove(report, criticInput.strictMode);

      // Step 9: Store review results
      await this.storeReviewResults(projectId, report);

      logger.info(`[${this.config.name}] Review complete`, {
        approved,
        score: report.overallScore,
        issues: report.issues.length,
        securityFindings: report.securityFindings.length,
      });

      return {
        success: approved,
        message: approved
          ? `Code review passed! Score: ${report.overallScore}/100`
          : `Code review failed. Score: ${report.overallScore}/100. ${report.mustFix.length} critical issues found.`,
        iterations: 1,
        durationMs: 0,
        data: {
          approved,
          report,
          filesReviewed: files.length,
          criticalIssues: report.mustFix.length,
          recommendations: report.suggestions.slice(0, 5),
        },
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Code review failed`, toError(error));

      return {
        success: false,
        message: "Code review failed",
        iterations: 1,
        durationMs: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        data: {
          approved: false, // Always provide approved field, even on error
          report: undefined,
          filesReviewed: 0,
          criticalIssues: 0,
          recommendations: [],
        },
      };
    }
  }

  /**
   * Load files to review
   */
  private async loadFilesToReview(
    projectId: string,
    userId: string,
    filePaths: string[]
  ): Promise<Array<{ path: string; content: string; language: string }>> {
    const files: Array<{ path: string; content: string; language: string }> =
      [];

    for (const filePath of filePaths) {
      try {
        const result = await this.executeTool(
          "filesystem",
          { operation: "read", path: filePath },
          { projectId, userId }
        );

        const data = result.data as { content?: string };
        if (result.success && data?.content) {
          files.push({
            path: filePath,
            content: data.content,
            language: this.detectLanguage(filePath),
          });
        }
      } catch (error) {
        logger.warn(`[${this.config.name}] Failed to load file: ${filePath}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return files;
  }

  /**
   * Analyze code structure using code_analysis tool
   */
  private async analyzeCodeStructure(
    projectId: string,
    userId: string,
    files: Array<{ path: string; content: string; language: string }>
  ): Promise<CodeStructure> {
    const analysis: CodeStructure = {};

    for (const file of files) {
      try {
        const result = await this.executeTool(
          "code_analysis",
          {
            operation: "analyze_file",
            path: file.path,
            language: file.language,
          },
          { projectId, userId }
        );

        const data = result.data as { structure?: unknown };
        if (result.success && result.data) {
          analysis[file.path] = data.structure;
        }
      } catch (error) {
        logger.warn(`[${this.config.name}] Failed to analyze: ${file.path}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return analysis;
  }

  /**
   * Run static analysis (linters, type checkers)
   */
  private async runStaticAnalysis(
    projectId: string,
    userId: string,
    files: Array<{ path: string; content: string; language: string }>
  ): Promise<StaticAnalysis> {
    const lintIssues: LintIssue[] = [];
    const typeErrors: LintIssue[] = [];

    // Group files by language
    const filesByLang = files.reduce(
      (acc, file) => {
        if (!acc[file.language]) acc[file.language] = [];
        acc[file.language].push(file.path);
        return acc;
      },
      {} as Record<string, string[]>
    );

    // Run language-specific linters
    for (const [lang, paths] of Object.entries(filesByLang)) {
      try {
        // TypeScript/JavaScript - ESLint + tsc
        if (lang === "typescript" || lang === "javascript") {
          // Run ESLint
          const lintResult = await this.executeTool(
            "command",
            {
              command: `npx eslint ${paths.join(" ")} --format json 2>&1 || true`,
              timeout: 60,
            },
            { projectId, userId }
          );

          const lintData = lintResult.data as { stdout?: string };
          if (lintResult.success && lintData?.stdout) {
            try {
              const eslintOutput = JSON.parse(lintData.stdout) as Array<{
                filePath: string;
                messages?: Array<{
                  line: number;
                  severity: number;
                  message: string;
                  ruleId: string;
                }>;
              }>;
              if (Array.isArray(eslintOutput)) {
                eslintOutput.forEach(
                  (fileResult: {
                    filePath: string;
                    messages?: Array<{
                      line: number;
                      severity: number;
                      message: string;
                      ruleId: string;
                    }>;
                  }) => {
                    fileResult.messages?.forEach((msg) => {
                      lintIssues.push({
                        file: fileResult.filePath,
                        line: msg.line,
                        severity:
                          msg.severity === 2
                            ? "high"
                            : msg.severity === 1
                              ? "medium"
                              : "low",
                        message: msg.message,
                        rule: msg.ruleId,
                      });
                    });
                  }
                );
              }
            } catch (error) {
              logger.warn(
                `[${this.config.name}] Failed to parse ESLint output`,
                {
                  error: error instanceof Error ? error.message : String(error),
                  projectId,
                }
              );
            }
          }

          // Run TypeScript compiler
          if (lang === "typescript") {
            const tscResult = await this.executeTool(
              "code_analysis",
              { operation: "check_types", language: "typescript" },
              { projectId, userId }
            );

            const tscData = tscResult.data as {
              errors?: Array<{
                file: string;
                line: number;
                severity: string;
                message: string;
                rule: string;
              }>;
            };
            if (tscResult.success && tscData?.errors) {
              typeErrors.push(...tscData.errors);
            }
          }
        }

        // Python - pylint
        if (lang === "python") {
          const pylintResult = await this.executeTool(
            "command",
            {
              command: `pylint ${paths.join(" ")} --output-format=json 2>&1 || true`,
              timeout: 60,
            },
            { projectId, userId }
          );

          const pylintData = pylintResult.data as { stdout?: string };
          if (pylintResult.success && pylintData?.stdout) {
            try {
              const pylintOutput = JSON.parse(pylintData.stdout) as Array<{
                path: string;
                line: number;
                type: string;
                message: string;
                symbol: string;
              }>;
              if (Array.isArray(pylintOutput)) {
                pylintOutput.forEach(
                  (issue: {
                    path: string;
                    line: number;
                    type: string;
                    message: string;
                    symbol: string;
                  }) => {
                    lintIssues.push({
                      file: issue.path,
                      line: issue.line,
                      severity: this.mapPylintSeverity(issue.type),
                      message: issue.message,
                      rule: issue.symbol,
                    });
                  }
                );
              }
            } catch (error) {
              logger.warn(
                `[${this.config.name}] Failed to parse Pylint output`,
                {
                  error: error instanceof Error ? error.message : String(error),
                  projectId,
                }
              );
            }
          }
        }

        // Go - go vet + staticcheck
        if (lang === "go") {
          const goVetResult = await this.executeTool(
            "command",
            { command: "go vet ./... 2>&1 || true", timeout: 60 },
            { projectId, userId }
          );

          const goVetData = goVetResult.data as { stderr?: string };
          if (goVetResult.success && goVetData?.stderr) {
            this.parseGoVetOutput(goVetData.stderr, lintIssues);
          }
        }

        // Rust - clippy
        if (lang === "rust") {
          const clippyResult = await this.executeTool(
            "command",
            {
              command: "cargo clippy --message-format=json 2>&1 || true",
              timeout: 60,
            },
            { projectId, userId }
          );

          const clippyData = clippyResult.data as { stdout?: string };
          if (clippyResult.success && clippyData?.stdout) {
            this.parseClippyOutput(clippyData.stdout, lintIssues);
          }
        }
      } catch (error) {
        logger.warn(
          `[${this.config.name}] Static analysis failed for ${lang}`,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    return { lintIssues, typeErrors };
  }

  /**
   * Security scanning (OWASP Top 10 + common vulnerabilities)
   */
  private async securityScan(
    projectId: string,
    userId: string,
    files: Array<{ path: string; content: string; language: string }>,
    _context: ProjectContext
  ): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    for (const file of files) {
      // Check for common security issues
      const fileFindings = this.detectSecurityIssues(file);
      findings.push(...fileFindings);
    }

    // Language-specific security checks
    const langFindings = await this.languageSpecificSecurityChecks(
      projectId,
      userId,
      files
    );
    findings.push(...langFindings);

    return findings;
  }

  /**
   * Detect common security issues (pattern matching)
   */
  private detectSecurityIssues(file: {
    path: string;
    content: string;
    language: string;
  }): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
      // SQL Injection
      if (
        line.match(/query\s*=.*\+.*/) ||
        line.match(/execute\(.*\+.*\)/) ||
        line.match(/\$\{.*\}.*sql/i)
      ) {
        findings.push({
          severity: "critical",
          type: "SQL Injection",
          file: file.path,
          line: index + 1,
          description: "Potential SQL injection vulnerability detected",
          recommendation: "Use parameterized queries or prepared statements",
          cwe: "CWE-89",
          owasp: "A03:2021 – Injection",
        });
      }

      // XSS
      if (
        line.match(/innerHTML\s*=/) ||
        line.match(/dangerouslySetInnerHTML/) ||
        line.match(/document\.write\(/)
      ) {
        findings.push({
          severity: "high",
          type: "Cross-Site Scripting (XSS)",
          file: file.path,
          line: index + 1,
          description: "Potential XSS vulnerability - unsanitized HTML",
          recommendation: "Sanitize user input before rendering",
          cwe: "CWE-79",
          owasp: "A03:2021 – Injection",
        });
      }

      // Hardcoded secrets
      if (
        line.match(/password\s*=\s*['"][^'"]{8,}['"]/) ||
        line.match(/api_key\s*=\s*['"][^'"]{10,}['"]/) ||
        line.match(/secret\s*=\s*['"][^'"]{10,}['"]/)
      ) {
        findings.push({
          severity: "critical",
          type: "Hardcoded Secrets",
          file: file.path,
          line: index + 1,
          description: "Hardcoded credentials detected",
          recommendation: "Use environment variables for sensitive data",
          cwe: "CWE-798",
          owasp: "A07:2021 – Identification and Authentication Failures",
        });
      }

      // Insecure randomness
      if (line.match(/Math\.random\(\)/)) {
        findings.push({
          severity: "medium",
          type: "Insecure Randomness",
          file: file.path,
          line: index + 1,
          description: "Math.random() is not cryptographically secure",
          recommendation:
            "Use crypto.randomBytes() for security-sensitive operations",
          cwe: "CWE-330",
          owasp: "A02:2021 – Cryptographic Failures",
        });
      }

      // Eval usage
      if (line.match(/eval\(/)) {
        findings.push({
          severity: "critical",
          type: "Code Injection",
          file: file.path,
          line: index + 1,
          description: "Use of eval() can lead to code injection",
          recommendation: "Avoid eval(), use safer alternatives",
          cwe: "CWE-95",
          owasp: "A03:2021 – Injection",
        });
      }

      // Weak crypto
      if (line.match(/MD5|SHA1/i)) {
        findings.push({
          severity: "medium",
          type: "Weak Cryptography",
          file: file.path,
          line: index + 1,
          description: "MD5/SHA1 are cryptographically broken",
          recommendation: "Use SHA-256 or stronger algorithms",
          cwe: "CWE-327",
          owasp: "A02:2021 – Cryptographic Failures",
        });
      }
    });

    return findings;
  }

  /**
   * Language-specific security checks
   */
  private async languageSpecificSecurityChecks(
    projectId: string,
    userId: string,
    files: Array<{ path: string; content: string; language: string }>
  ): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Python - Bandit
    const pythonFiles = files.filter((f) => f.language === "python");
    if (pythonFiles.length > 0) {
      try {
        const banditResult = await this.executeTool(
          "command",
          {
            command: `bandit -r ${pythonFiles.map((f) => f.path).join(" ")} -f json 2>&1 || true`,
            timeout: 60,
          },
          { projectId, userId }
        );

        const banditData = banditResult.data as { stdout?: string };
        if (banditResult.success && banditData?.stdout) {
          try {
            const banditOutput = JSON.parse(banditData.stdout) as {
              results?: Array<{
                issue_severity: string;
                issue_text: string;
                filename: string;
                line_number: number;
                issue_cwe?: { id: string };
              }>;
            };
            banditOutput.results?.forEach((issue) => {
              findings.push({
                severity: this.mapBanditSeverity(issue.issue_severity),
                type: issue.issue_text,
                file: issue.filename,
                line: issue.line_number,
                description: issue.issue_text,
                recommendation: "Review Bandit documentation for this issue",
                cwe: issue.issue_cwe?.id || "Unknown",
              });
            });
          } catch (error) {
            logger.warn(`[${this.config.name}] Failed to parse Bandit output`, {
              error: error instanceof Error ? error.message : String(error),
              projectId,
            });
          }
        }
      } catch (error) {
        logger.warn(`[${this.config.name}] Bandit scan failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return findings;
  }

  /**
   * Performance analysis
   */
  private performanceCheck(
    projectId: string,
    userId: string,
    files: Array<{ path: string; content: string; language: string }>,
    context: ProjectContext
  ): Promise<PerformanceWarning[]> {
    const warnings: PerformanceWarning[] = [];

    for (const file of files) {
      const fileWarnings = this.detectPerformanceIssues(file, context);
      warnings.push(...fileWarnings);
    }

    return Promise.resolve(warnings);
  }

  /**
   * Detect performance issues
   */
  private detectPerformanceIssues(
    file: { path: string; content: string; language: string },
    _context: ProjectContext
  ): PerformanceWarning[] {
    const warnings: PerformanceWarning[] = [];
    const lines = file.content.split("\n");

    lines.forEach((line, index) => {
      // N+1 Query (database in loop)
      if (
        line.match(/for.*in.*:/) &&
        file.content
          .slice(file.content.indexOf(line), file.content.indexOf(line) + 500)
          .match(/findMany|find\(|query/)
      ) {
        warnings.push({
          severity: "high",
          type: "N+1 Query",
          file: file.path,
          line: index + 1,
          description: "Potential N+1 query - database call inside loop",
          impact:
            "Can cause severe performance degradation with large datasets",
          suggestion: "Use batch queries or eager loading",
        });
      }

      // Memory leak - event listener without cleanup
      if (
        line.match(/addEventListener/) &&
        !file.content.includes("removeEventListener")
      ) {
        warnings.push({
          severity: "medium",
          type: "Memory Leak",
          file: file.path,
          line: index + 1,
          description: "Event listener added without corresponding cleanup",
          impact: "Memory leaks over time",
          suggestion: "Add removeEventListener in cleanup/unmount",
        });
      }

      // Large synchronous operation
      if (
        line.match(/\.sort\(\)|\.filter\(\)/) &&
        file.content.includes("forEach")
      ) {
        warnings.push({
          severity: "low",
          type: "Inefficient Algorithm",
          file: file.path,
          line: index + 1,
          description: "Multiple array iterations - could be combined",
          impact: "Unnecessary CPU cycles",
          suggestion: "Combine operations using method chaining",
        });
      }
    });

    return warnings;
  }

  /**
   * AI-powered comprehensive code review
   */
  private async aiCodeReview(
    files: Array<{ path: string; content: string; language: string }>,
    codeAnalysis: CodeStructure,
    staticAnalysis: StaticAnalysis,
    context: ProjectContext
  ): Promise<{
    issues: CodeIssue[];
    suggestions: string[];
    scores: ReviewScores;
  }> {
    try {
      const prompt = this.buildReviewPrompt(
        files,
        codeAnalysis,
        staticAnalysis,
        context
      );

      const responseText = await this.generateContent(prompt);

      return this.parseReviewResponse(responseText);
    } catch (error) {
      logger.error(`[${this.config.name}] AI review failed`, toError(error));
      return {
        issues: [],
        suggestions: [],
        scores: {
          codeQuality: 60,
          security: 60,
          performance: 60,
          maintainability: 60,
          documentation: 60,
        },
      };
    }
  }

  /**
   * Build AI review prompt
   */
  private buildReviewPrompt(
    files: Array<{ path: string; content: string; language: string }>,
    codeAnalysis: CodeStructure,
    staticAnalysis: StaticAnalysis,
    context: ProjectContext
  ): string {
    const filesSummary = files
      .map(
        (f) => `
**File: ${f.path}** (${f.language})
\`\`\`${f.language}
${f.content.substring(0, 2000)}${f.content.length > 2000 ? "\n... (truncated)" : ""}
\`\`\`
`
      )
      .join("\n\n");

    return `
You are a world-class code reviewer. Review this code comprehensively.

**FILES TO REVIEW:**
${filesSummary}

**CODE ANALYSIS:**
\`\`\`json
${JSON.stringify(codeAnalysis, null, 2)}
\`\`\`

**STATIC ANALYSIS RESULTS:**
Lint Issues: ${staticAnalysis.lintIssues.length}
Type Errors: ${staticAnalysis.typeErrors.length}

**TECH STACK:**
${JSON.stringify(context.techStack, null, 2)}

**REVIEW CRITERIA:**

1. **Code Quality (0-100)**
   - Clean code principles
   - DRY, SOLID principles
   - Naming conventions
   - Code organization

2. **Security (0-100)**
   - OWASP Top 10
   - Input validation
   - Authentication/Authorization
   - Data sanitization

3. **Performance (0-100)**
   - Algorithm efficiency
   - Memory management
   - Database query optimization
   - Async/await usage

4. **Maintainability (0-100)**
   - Code readability
   - Comments and documentation
   - Testability
   - Modularity

5. **Documentation (0-100)**
   - Function/class comments
   - Complex logic explanations
   - API documentation
   - README completeness

**OUTPUT FORMAT:**
Respond with ONLY valid JSON:

\`\`\`json
{
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "category": "quality" | "security" | "performance" | "maintainability" | "documentation",
      "file": "src/app.ts",
      "line": 42,
      "message": "Issue description",
      "suggestion": "How to fix",
      "rule": "rule-name"
    }
  ],
  "suggestions": [
    "General improvement suggestion 1",
    "General improvement suggestion 2"
  ],
  "scores": {
    "codeQuality": 85,
    "security": 90,
    "performance": 75,
    "maintainability": 80,
    "documentation": 70
  }
}
\`\`\`

**IMPORTANT:**
- Be thorough but constructive
- Prioritize critical/high severity issues
- Provide actionable suggestions
- Consider the tech stack and project context
`.trim();
  }

  /**
   * Parse AI review response
   */
  private parseReviewResponse(responseText: string): {
    issues: CodeIssue[];
    suggestions: string[];
    scores: ReviewScores;
  } {
    try {
      let cleaned = responseText.trim();
      cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");

      const parsed = JSON.parse(cleaned) as {
        issues?: CodeIssue[];
        suggestions?: string[];
        scores?: ReviewScores;
      };

      return {
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || [],
        scores: parsed.scores || {
          codeQuality: 60,
          security: 60,
          performance: 60,
          maintainability: 60,
          documentation: 60,
        },
      };
    } catch (error) {
      logger.error(
        `[${this.config.name}] Failed to parse AI review`,
        error instanceof Error ? error : new Error(String(error)),
        { preview: responseText.substring(0, 500) }
      );
      return {
        issues: [],
        suggestions: [],
        scores: {
          codeQuality: 60,
          security: 60,
          performance: 60,
          maintainability: 60,
          documentation: 60,
        },
      };
    }
  }

  /**
   * Compile comprehensive review report
   */
  private compileReviewReport(
    files: Array<{ path: string; content: string; language: string }>,
    aiReview: {
      issues: CodeIssue[];
      suggestions: string[];
      scores: ReviewScores;
    },
    staticAnalysis: StaticAnalysis,
    securityFindings: SecurityFinding[],
    performanceWarnings: PerformanceWarning[]
  ): ReviewReport {
    // Combine all issues
    const allIssues: CodeIssue[] = [
      ...aiReview.issues,
      ...this.convertLintIssuesToCodeIssues(staticAnalysis.lintIssues),
      ...this.convertTypeErrorsToCodeIssues(staticAnalysis.typeErrors),
    ];

    // Calculate metrics
    const metrics = {
      codeQualityScore: aiReview.scores.codeQuality || 60,
      securityScore: Math.max(0, 100 - securityFindings.length * 10),
      performanceScore: Math.max(0, 100 - performanceWarnings.length * 5),
      maintainabilityScore: aiReview.scores.maintainability || 60,
      documentationScore: aiReview.scores.documentation || 60,
    };

    // Calculate overall score
    const overallScore = Math.round(
      metrics.codeQualityScore * 0.3 +
        metrics.securityScore * 0.3 +
        metrics.performanceScore * 0.2 +
        metrics.maintainabilityScore * 0.1 +
        metrics.documentationScore * 0.1
    );

    // Categorize issues
    const mustFix = allIssues.filter(
      (i) => i.severity === "critical" || i.severity === "high"
    );
    const shouldFix = allIssues.filter((i) => i.severity === "medium");
    const optional = allIssues.filter(
      (i) => i.severity === "low" || i.severity === "info"
    );

    // Approval decision
    const approved =
      mustFix.length === 0 &&
      metrics.securityScore >= this.MIN_SECURITY_SCORE &&
      overallScore >= this.MIN_QUALITY_SCORE;

    return {
      approved,
      overallScore,
      issues: allIssues,
      securityFindings,
      performanceWarnings,
      suggestions: aiReview.suggestions,
      metrics,
      summary: `Review of ${files.length} file(s). Score: ${overallScore}/100. ${mustFix.length} critical issues, ${shouldFix.length} medium issues.`,
      mustFix,
      shouldFix,
      optional,
    };
  }

  /**
   * Determine if code should be approved
   */
  private shouldApprove(
    report: ReviewReport,
    strictMode: boolean = false
  ): boolean {
    if (strictMode) {
      // Strict mode: No critical/high severity issues allowed
      return (
        report.mustFix.length === 0 &&
        report.overallScore >= 80 &&
        report.metrics.securityScore >= 90
      );
    } else {
      // Normal mode: Allow some issues if overall quality is good
      return (
        report.mustFix.filter((i) => i.severity === "critical").length === 0 &&
        report.overallScore >= this.MIN_QUALITY_SCORE &&
        report.metrics.securityScore >= this.MIN_SECURITY_SCORE
      );
    }
  }

  /**
   * Store review results in database
   */
  private async storeReviewResults(
    projectId: string,
    report: ReviewReport
  ): Promise<void> {
    try {
      // Store in ProjectContext for tracking
      const existingContext = await prisma.projectContext.findUnique({
        where: { projectId },
      });
      const codebase = existingContext?.codebase as Record<
        string,
        unknown
      > | null;
      await prisma.projectContext.update({
        where: { projectId },
        data: {
          codebase: {
            ...(codebase || {}),
            lastReview: report as unknown,
          } as unknown as Prisma.InputJsonValue,
          lastReviewScore: report.overallScore,
          updatedAt: new Date(),
        },
      });

      logger.info(`[${this.config.name}] Stored review results`);
    } catch (error) {
      logger.warn(`[${this.config.name}] Failed to store review results`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Helper methods
  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      java: "java",
      cs: "csharp",
      go: "go",
      rs: "rust",
      cpp: "cpp",
      c: "c",
      php: "php",
      rb: "ruby",
    };
    return map[ext || ""] || "unknown";
  }

  private mapPylintSeverity(type: string): IssueSeverity {
    if (type === "error") return "high";
    if (type === "warning") return "medium";
    if (type === "convention" || type === "refactor") return "low";
    return "info";
  }

  private mapBanditSeverity(severity: string): SecurityFinding["severity"] {
    if (severity === "HIGH") return "critical";
    if (severity === "MEDIUM") return "high";
    return "medium";
  }

  private parseGoVetOutput(output: string, issues: LintIssue[]): void {
    const lines = output.split("\n");
    lines.forEach((line) => {
      const match = line.match(/^(.+?):(\d+):(\d+): (.+)$/);
      if (match) {
        issues.push({
          file: match[1],
          line: parseInt(match[2]),
          severity: "medium",
          message: match[4],
          rule: "go-vet",
        });
      }
    });
  }

  private parseClippyOutput(output: string, issues: LintIssue[]): void {
    const lines = output.split("\n");
    lines.forEach((line) => {
      try {
        const parsed = JSON.parse(line) as {
          message?: {
            message: string;
            spans?: Array<{ line_start: number }>;
          };
          target?: { src_path?: string };
        };
        if (parsed.message) {
          issues.push({
            file: parsed.target?.src_path || "unknown",
            line: parsed.message.spans?.[0]?.line_start || 0,
            severity: "medium",
            message: parsed.message.message,
            rule: "clippy",
          });
        }
      } catch {
        // Skip invalid JSON lines (Clippy outputs mixed text and JSON)
        logger.debug(
          `[${this.config.name}] Skipped non-JSON line in Clippy output`,
          {
            line: line.substring(0, 100), // First 100 chars for debugging
          }
        );
      }
    });
  }

  private convertLintIssuesToCodeIssues(lintIssues: LintIssue[]): CodeIssue[] {
    return lintIssues.map((issue) => ({
      severity: issue.severity as "critical" | "high" | "medium" | "low",
      category: "quality" as const,
      file: issue.file,
      line: issue.line,
      message: issue.message,
      suggestion: "Fix linting issue",
      rule: issue.rule,
    }));
  }

  private convertTypeErrorsToCodeIssues(typeErrors: LintIssue[]): CodeIssue[] {
    return typeErrors.map((error) => ({
      severity: "high" as const,
      category: "type_safety" as const,
      file: error.file,
      line: error.line,
      message: error.message,
      suggestion: "Fix type error",
      rule: error.rule || "type-error",
    }));
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const criticAgent = new CriticAgent();
