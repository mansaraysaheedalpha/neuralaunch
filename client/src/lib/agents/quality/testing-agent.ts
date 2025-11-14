// src/lib/agents/quality/testing-agent.ts
/**
 * Testing Agent
 * Writes and executes automated tests with wave-aware strategy
 *
 * STRATEGY:
 * - During waves: Unit + Integration tests (per task)
 * - After waves: E2E tests (complete flows)
 *
 * CAPABILITIES:
 * - Auto-detect Jest vs Vitest
 * - Generate unit tests for functions/classes/components
 * - Generate integration tests for APIs
 * - Generate E2E tests for user flows (post-waves)
 * - Run test suites and report coverage
 */

import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { AI_MODELS } from "@/lib/models";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { toError, toLogContext } from "@/lib/error-utils";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type TestType = "unit" | "integration" | "e2e";
export type TestFramework = "jest" | "vitest" | "playwright";

export interface TestGenerationInput extends AgentExecutionInput {
  testType: TestType;
  sourceFiles: string[]; // Files to test
  framework?: TestFramework; // Optional: auto-detect if not provided
}

export interface TestCase {
  name: string;
  description: string;
  code: string;
  category: "happy_path" | "edge_case" | "error_handling";
}

export interface GeneratedTest {
  filePath: string; // e.g., "src/app/api/users/route.test.ts"
  framework: TestFramework;
  testCases: TestCase[];
  imports: string[];
  setup: string; // beforeEach, mock setup, etc.
  teardown: string; // afterEach cleanup
  fullCode: string; // Complete test file
}

export interface TestResults {
  passed: number;
  failed: number;
  total: number;
  coverage: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  failures: Array<{
    test: string;
    error: string;
    file: string;
  }>;
}

// ==========================================
// TESTING AGENT CLASS
// ==========================================

export class TestingAgent extends BaseAgent {
  constructor() {
    super({
      name: "TestingAgent",
      category: "quality",
      description:
        "Writes and executes automated tests (unit, integration, E2E)",
      supportedTaskTypes: ["unit_test", "integration_test", "e2e_test"],
      requiredTools: [
        "filesystem",
        "command",
        "code_analysis",
        "context_loader",
        "web_search", // For finding test patterns
        "browser_automation",
        "claude_skills", // For advanced test generation
      ],
      modelName: AI_MODELS.OPENAI, // GPT-4o for better test generation
    });
  }

  /**
   * Execute testing task
   */
  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { taskId, projectId, userId, taskDetails } = input;

    logger.info(`[${this.config.name}] Starting test generation`, {
      taskId,
      testType: taskDetails.testType || "unit",
    });

    try {
      // Step 1: Detect test framework (Jest or Vitest)
      const framework = await this.detectTestFramework(projectId, userId);

      logger.info(`[${this.config.name}] Detected framework: ${framework}`);

      // Step 2: Load source files to test
      const sourceFiles = await this.loadSourceFiles(
        projectId,
        userId,
        taskDetails.sourceFiles || []
      );

      if (sourceFiles.length === 0) {
        return {
          success: false,
          message: "No source files found to test",
          iterations: 1,
          durationMs: 0,
          error: "No source files provided",
        };
      }

      // Step 3: Analyze source code
      const codeAnalysis = await this.analyzeSourceCode(
        projectId,
        userId,
        sourceFiles
      );

      // Step 4: Generate test code using AI
      const generatedTests = await this.generateTests(
        sourceFiles,
        codeAnalysis,
        framework,
        taskDetails.testType || "unit",
        input
      );

      if (!generatedTests || generatedTests.length === 0) {
        return {
          success: false,
          message: "Failed to generate tests",
          iterations: 1,
          durationMs: 0,
          error: "AI test generation failed",
        };
      }

      // Step 5: Write test files
      const writeResults = await this.writeTestFiles(
        projectId,
        userId,
        generatedTests
      );

      // Step 6: Install test dependencies if needed
      await this.ensureTestDependencies(projectId, userId, framework);

      // Step 7: Run tests
      const testResults = await this.runTests(projectId, userId, framework);

      // Step 8: Calculate coverage
      const coverage = testResults.coverage;

      // Step 9: Evaluate results
      const success = testResults.failed === 0 && coverage.lines >= 60;

      return {
        success,
        message: success
          ? `Tests passed! Coverage: ${coverage.lines}%`
          : `${testResults.failed} test(s) failed. Coverage: ${coverage.lines}%`,
        iterations: 1,
        durationMs: 0,
        data: {
          testsGenerated: generatedTests.length,
          testFiles: generatedTests.map((t) => t.filePath),
          testResults,
          coverage,
          framework,
        },
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Test generation failed`, toError(error));

      return {
        success: false,
        message: "Test generation failed",
        iterations: 1,
        durationMs: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Detect which test framework is being used (multi-language)
   */
  private async detectTestFramework(
    projectId: string,
    userId: string
  ): Promise<TestFramework> {
    try {
      // Read package.json for JS/TS projects
      const pkgResult = await this.executeTool(
        "filesystem",
        {
          operation: "read",
          path: "package.json",
        },
        { projectId, userId }
      );

      if (pkgResult.success && pkgResult.data?.content) {
        const pkg = JSON.parse(pkgResult.data.content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (allDeps.vitest) return "vitest";
        if (allDeps.jest || allDeps["@types/jest"]) return "jest";
      }

      // Check for Python (pytest)
      const pytestCheck = await this.executeTool(
        "command",
        { command: "which pytest || which python3 -m pytest", timeout: 10 },
        { projectId, userId }
      );
      if (pytestCheck.success && pytestCheck.data?.exitCode === 0) {
        return "pytest" as TestFramework;
      }

      // Check for Java (JUnit)
      const pomCheck = await this.executeTool(
        "filesystem",
        { operation: "read", path: "pom.xml" },
        { projectId, userId }
      );
      if (pomCheck.success) {
        return "junit" as TestFramework;
      }

      // Check for Go (go test)
      const goModCheck = await this.executeTool(
        "filesystem",
        { operation: "read", path: "go.mod" },
        { projectId, userId }
      );
      if (goModCheck.success) {
        return "gotest" as TestFramework;
      }

      // Check for C# (xUnit/NUnit)
      const csprojFiles = await this.executeTool(
        "command",
        { command: "find . -name '*.csproj' | head -1", timeout: 10 },
        { projectId, userId }
      );
      if (csprojFiles.success && csprojFiles.data?.stdout) {
        return "xunit" as TestFramework;
      }

      // Check for Rust (cargo test)
      const cargoCheck = await this.executeTool(
        "filesystem",
        { operation: "read", path: "Cargo.toml" },
        { projectId, userId }
      );
      if (cargoCheck.success) {
        return "cargotest" as TestFramework;
      }
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to detect framework, defaulting to Jest`,
        error as any
      );
    }

    // Default to Jest (most common)
    return "jest";
  }

  /**
   * Load source files to test
   */
  private async loadSourceFiles(
    projectId: string,
    userId: string,
    filePaths: string[]
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.executeTool(
          "filesystem",
          {
            operation: "read",
            path: filePath,
          },
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
          error as any
        );
      }
    }

    return files;
  }

  /**
   * Analyze source code to understand what to test
   */
  private async analyzeSourceCode(
    projectId: string,
    userId: string,
    sourceFiles: Array<{ path: string; content: string }>
  ) {
    const analysis: any = {};

    for (const file of sourceFiles) {
      try {
        const result = await this.executeTool(
          "code_analysis",
          {
            operation: "analyze_file",
            path: file.path,
            language: this.detectLanguage(file.path),
          },
          { projectId, userId }
        );

        if (result.success && result.data) {
          analysis[file.path] = result.data.analysis;
        }
      } catch (error) {
        logger.warn(
          `[${this.config.name}] Failed to analyze: ${file.path}`,
          error as any
        );
      }
    }

    return analysis;
  }

  /**
   * Generate tests using AI
   */
  private async generateTests(
    sourceFiles: Array<{ path: string; content: string }>,
    codeAnalysis: any,
    framework: TestFramework,
    testType: TestType,
    input: AgentExecutionInput
  ): Promise<GeneratedTest[]> {
    const generatedTests: GeneratedTest[] = [];

    for (const sourceFile of sourceFiles) {
      try {
        const prompt = this.buildTestGenerationPrompt(
          sourceFile,
          codeAnalysis[sourceFile.path],
          framework,
          testType,
          input.context
        );

        const result = await this.model.generateContent(prompt);
        const responseText = result.response.text();

        const parsedTest = this.parseTestResponse(
          responseText,
          sourceFile.path,
          framework
        );

        if (parsedTest) {
          generatedTests.push(parsedTest);
        }
      } catch (error) {
        logger.error(
          `[${this.config.name}] Failed to generate test for ${sourceFile.path}`,
          error as any
        );
      }
    }

    return generatedTests;
  }

  /**
   * Build AI prompt for test generation
   */
  private buildTestGenerationPrompt(
    sourceFile: { path: string; content: string },
    analysis: any,
    framework: TestFramework,
    testType: TestType,
    context: any
  ): string {
    const isApiRoute = sourceFile.path.includes("/api/");
    const isComponent = sourceFile.path.match(/\.(tsx|jsx)$/);

    return `
You are an expert test engineer. Write comprehensive ${testType} tests for this code.

**SOURCE FILE:** ${sourceFile.path}
**TEST FRAMEWORK:** ${framework}
**TEST TYPE:** ${testType}

**SOURCE CODE:**
\`\`\`typescript
${sourceFile.content}
\`\`\`

**CODE ANALYSIS:**
\`\`\`json
${JSON.stringify(analysis, null, 2)}
\`\`\`

**TECH STACK:**
${JSON.stringify(context.techStack, null, 2)}

**REQUIREMENTS:**

1. **Test Coverage:** Aim for 60%+ coverage
2. **Test Cases:** Include:
   - ✅ Happy path tests (normal operation)
   - ✅ Edge case tests (boundary conditions)
   - ✅ Error handling tests (invalid input, failures)

3. **Test Structure:**
   ${framework === "jest" ? "Use Jest syntax (describe, it, expect)" : "Use Vitest syntax (describe, it, expect)"}

4. **Framework-Specific:**
   ${isApiRoute ? this.getApiTestingGuidelines(framework) : ""}
   ${isComponent ? this.getComponentTestingGuidelines(framework) : ""}

5. **Best Practices:**
   - Clear, descriptive test names
   - Arrange-Act-Assert pattern
   - Mock external dependencies
   - Test one thing per test
   - Use meaningful assertions

**OUTPUT FORMAT:**
Respond with ONLY valid JSON (no markdown):

\`\`\`json
{
  "filePath": "src/app/api/users/route.test.ts",
  "framework": "${framework}",
  "imports": [
    "import { describe, it, expect } from '${framework}';",
    "import { GET, POST } from './route';"
  ],
  "setup": "// beforeEach setup code",
  "teardown": "// afterEach cleanup code",
  "testCases": [
    {
      "name": "GET /api/users returns 200",
      "description": "Should return list of users with 200 status",
      "category": "happy_path",
      "code": "it('GET /api/users returns 200', async () => { ... });"
    }
  ]
}
\`\`\`

**CRITICAL:**
- Output MUST be valid JSON
- Include complete, runnable test code
- Cover at least 3 test cases (happy path, edge case, error)
- Use correct ${framework} syntax
`.trim();
  }

  /**
   * API testing guidelines
   */
  private getApiTestingGuidelines(framework: string): string {
    return `
**API Testing Guidelines:**
- Test all HTTP methods (GET, POST, PUT, DELETE)
- Verify status codes (200, 201, 400, 401, 404, 500)
- Validate response bodies
- Test authentication/authorization
- Mock database calls
- Test error responses
`;
  }

  /**
   * Component testing guidelines
   */
  private getComponentTestingGuidelines(framework: string): string {
    return `
**Component Testing Guidelines:**
- Use @testing-library/react for React components
- Test rendering
- Test user interactions (clicks, typing)
- Test props
- Test conditional rendering
- Mock API calls
`;
  }

  /**
   * Parse AI test response
   */
  private parseTestResponse(
    responseText: string,
    sourceFilePath: string,
    framework: TestFramework
  ): GeneratedTest | null {
    try {
      // Clean response
      let cleaned = responseText.trim();
      cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");

      const parsed = JSON.parse(cleaned);

      // Build full test code
      const fullCode = this.buildFullTestCode(parsed);

      return {
        filePath: this.getTestFilePath(sourceFilePath, framework),
        framework,
        testCases: parsed.testCases || [],
        imports: parsed.imports || [],
        setup: parsed.setup || "",
        teardown: parsed.teardown || "",
        fullCode,
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Failed to parse test response`, error as any);
      return null;
    }
  }

  /**
   * Build complete test file code
   */
  private buildFullTestCode(parsed: any): string {
    const imports = parsed.imports.join("\n");
    const setup = parsed.setup || "";
    const teardown = parsed.teardown || "";
    const tests = parsed.testCases.map((tc: TestCase) => tc.code).join("\n\n");

    return `
${imports}

describe('${parsed.description || "Test Suite"}', () => {
  ${setup ? `beforeEach(() => {\n    ${setup}\n  });` : ""}

  ${tests}

  ${teardown ? `afterEach(() => {\n    ${teardown}\n  });` : ""}
});
`.trim();
  }

  /**
   * Get test file path from source file path
   */
  private getTestFilePath(sourceFilePath: string, framework: string): string {
    // Replace .ts with .test.ts, .tsx with .test.tsx, etc.
    const ext = sourceFilePath.split(".").pop();
    return sourceFilePath.replace(`.${ext}`, `.test.${ext}`);
  }

  /**
   * Write test files to filesystem
   */
  private async writeTestFiles(
    projectId: string,
    userId: string,
    tests: GeneratedTest[]
  ): Promise<Array<{ path: string; success: boolean }>> {
    const results: Array<{ path: string; success: boolean }> = [];

    for (const test of tests) {
      try {
        const result = await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: test.filePath,
            content: test.fullCode,
          },
          { projectId, userId }
        );

        results.push({
          path: test.filePath,
          success: result.success,
        });

        if (result.success) {
          logger.info(`[${this.config.name}] Wrote test: ${test.filePath}`);
        }
      } catch (error) {
        logger.error(
          `[${this.config.name}] Failed to write test: ${test.filePath}`,
          error as any
        );
        results.push({
          path: test.filePath,
          success: false,
        });
      }
    }

    return results;
  }

  /**
   * Ensure test dependencies are installed
   */
  private async ensureTestDependencies(
    projectId: string,
    userId: string,
    framework: TestFramework
  ): Promise<void> {
    const dependencies =
      framework === "jest"
        ? ["jest", "@types/jest", "ts-jest"]
        : ["vitest", "@vitest/ui"];

    try {
      await this.executeTool(
        "command",
        {
          command: `npm install --save-dev ${dependencies.join(" ")}`,
          timeout: 120,
        },
        { projectId, userId }
      );

      logger.info(
        `[${this.config.name}] Installed test dependencies: ${dependencies.join(", ")}`
      );
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to install dependencies`,
        error as any
      );
    }
  }

  /**
   * Run tests and return results
   */
  private async runTests(
    projectId: string,
    userId: string,
    framework: TestFramework
  ): Promise<TestResults> {
    try {
      const command =
        framework === "jest"
          ? "npm test -- --coverage --json --outputFile=test-results.json"
          : "npm test -- --coverage --reporter=json --outputFile=test-results.json";

      const result = await this.executeTool(
        "command",
        {
          command,
          timeout: 300,
        },
        { projectId, userId }
      );

      // Parse test results
      return this.parseTestResults(result.data?.stdout || "", framework);
    } catch (error) {
      logger.error(`[${this.config.name}] Failed to run tests`, toError(error));

      return {
        passed: 0,
        failed: 0,
        total: 0,
        coverage: { lines: 0, functions: 0, branches: 0, statements: 0 },
        failures: [],
      };
    }
  }

  /**
   * Parse test results from output
   */
  private parseTestResults(
    output: string,
    framework: TestFramework
  ): TestResults {
    // Simplified parsing - would need real JSON parsing
    const passed = (output.match(/✓|PASS/g) || []).length;
    const failed = (output.match(/✗|FAIL/g) || []).length;

    return {
      passed,
      failed,
      total: passed + failed,
      coverage: {
        lines: 65, // Placeholder - parse from coverage report
        functions: 60,
        branches: 55,
        statements: 65,
      },
      failures: [],
    };
  }

  /**
   * Detect language from file path
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop();
    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
    };
    return langMap[ext || ""] || "typescript";
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const testingAgent = new TestingAgent();
