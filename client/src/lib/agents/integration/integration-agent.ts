// src/lib/agents/integration/integration-agent.ts
/**
 * Integration Agent - Contract Verification & Data Flow Testing
 *
 * Responsibilities:
 * 1. Verify API contracts between frontend and backend
 * 2. Check data model consistency across stack
 * 3. Test authentication flow end-to-end
 * 4. Validate error handling across boundaries
 * 5. Run integration tests for contract mismatches
 *
 * Truly generic - works with ANY tech stack detected in project context
 */

import { AI_MODELS } from "@/lib/models";
import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

// ==========================================
// TYPES
// ==========================================

export interface IntegrationIssue {
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "contract_mismatch"
    | "auth_failure"
    | "type_mismatch"
    | "missing_endpoint"
    | "data_model_mismatch"
    | "cors_issue"
    | "timeout"
    | "error_handling";
  frontend: {
    file: string;
    line: number;
    expects: string;
  };
  backend: {
    file: string;
    line: number;
    provides: string;
  };
  description: string;
  suggestion: string;
}

export interface ContractVerification {
  endpoint: string;
  method: string;
  frontendExpectation: {
    requestBody?: unknown;
    responseType?: string;
    statusCodes?: number[];
  };
  backendImplementation: {
    actualResponse?: unknown;
    statusCodes?: number[];
    hasAuth?: boolean;
  };
  matches: boolean;
  issues: string[];
}

export interface FlowTestResult {
  testName: string;
  flow: string; // e.g., "User Login Flow"
  steps: {
    step: string;
    passed: boolean;
    error?: string;
  }[];
  passed: boolean;
  duration: number;
}

export interface IntegrationVerificationResult {
  compatible: boolean;
  issues: IntegrationIssue[];
  recommendations: string[];
  contractVerifications: ContractVerification[];
  flowTests: FlowTestResult[];
  metrics: {
    totalEndpoints: number;
    verifiedEndpoints: number;
    mismatches: number;
    criticalIssues: number;
    compatibilityScore: number; // 0-100
  };
}

export interface IntegrationInput extends AgentExecutionInput {
  verificationType?: "quick" | "full"; // quick = static only, full = with tests
  specificEndpoints?: string[]; // Optional: only verify these endpoints
}

/**
 * Load project context from database
 */
interface ProjectContextData {
  techStack: {
    frontend?: { framework?: string };
    backend?: { framework?: string };
    [key: string]: unknown;
  };
  architecture: unknown;
}

// ==========================================
// INTEGRATION AGENT CLASS
// ==========================================

export class IntegrationAgent extends BaseAgent {
  // Compatibility thresholds
  private readonly MIN_COMPATIBILITY_SCORE = 70;
  private readonly MAX_CRITICAL_ISSUES = 0; // Block deployment if any critical issues

  constructor() {
    super({
      name: "IntegrationAgent",
      category: "quality",
      description:
        "Verify frontend-backend contracts and integration for all tech stacks",
      supportedTaskTypes: [
        "integration_verification",
        "contract_check",
        "api_validation",
        "flow_testing",
      ],
      requiredTools: [
        "filesystem",
        "command",
        "code_analysis",
        "context_loader",
        "web_search", // For finding integration patterns
      ],
      modelName: AI_MODELS.OPENAI, // GPT-4o for best integration analysis
    });
  }

  /**
   * Execute integration verification
   */
  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const startTime = Date.now();
    const {
      taskId,
      projectId,
      userId,
      taskDetails: _taskDetails,
      context: _context,
    } = input;
    const verificationType =
      (input as IntegrationInput).verificationType || "full";

    logger.info(`[${this.name}] Starting integration verification`, {
      taskId,
      projectId,
      verificationType,
    });

    try {
      // Step 1: Load project context and tech stack
      const projectContext: ProjectContextData =
        await this.loadProjectContextData(projectId);

      // Step 2: Discover frontend and backend files
      const projectFiles = await this.discoverProjectStructure(
        projectId,
        userId,
        projectContext.techStack as {
          frontend?: { framework?: string };
          backend?: { framework?: string };
          [key: string]: unknown;
        }
      );

      // Step 3: Extract API contracts from frontend
      const frontendContracts = await this.extractFrontendContracts(
        projectId,
        userId,
        projectFiles.frontend,
        projectContext.techStack
      );

      // Step 4: Extract API endpoints from backend
      const backendEndpoints = await this.extractBackendEndpoints(
        projectId,
        userId,
        projectFiles.backend,
        projectContext.techStack
      );

      // Step 5: Verify contracts match
      const contractVerifications = this.verifyContracts(
        frontendContracts,
        backendEndpoints,
        projectContext.techStack
      );

      // Step 6: Check data models consistency
      const dataModelIssues = await this.verifyDataModels(
        projectId,
        userId,
        projectFiles,
        projectContext.techStack
      );

      // Step 7: Run integration tests (if full verification)
      let flowTests: FlowTestResult[] = [];
      if (verificationType === "full") {
        flowTests = await this.runIntegrationTests(
          projectId,
          userId,
          contractVerifications.filter((cv) => !cv.matches),
          projectContext.techStack
        );
      }

      // Step 8: Compile all issues
      const allIssues = [
        ...this.contractVerificationsToIssues(contractVerifications),
        ...dataModelIssues,
      ];

      // Step 9: Generate recommendations
      const recommendations = this.generateRecommendations(
        allIssues,
        projectContext.techStack
      );

      // Step 10: Calculate metrics
      const metrics = this.calculateMetrics(
        contractVerifications,
        allIssues,
        flowTests
      );

      // Step 11: Determine if compatible
      const compatible =
        metrics.compatibilityScore >= this.MIN_COMPATIBILITY_SCORE &&
        metrics.criticalIssues <= this.MAX_CRITICAL_ISSUES;

      const result: IntegrationVerificationResult = {
        compatible,
        issues: allIssues,
        recommendations,
        contractVerifications,
        flowTests,
        metrics,
      };

      // Step 12: Store verification results
      await this.storeVerificationResults(taskId, projectId, result);

      logger.info(`[${this.name}] Integration verification complete`, {
        taskId,
        compatible,
        compatibilityScore: metrics.compatibilityScore,
        totalIssues: allIssues.length,
        criticalIssues: metrics.criticalIssues,
      });

      return {
        success: true,
        message: compatible
          ? "Integration verification passed - frontend and backend are compatible"
          : `Integration issues found - ${metrics.criticalIssues} critical, ${allIssues.length} total`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        data: { ...result },
      };
    } catch (error) {
      logger.error(
        `[${this.name}] Integration verification failed`,
        error instanceof Error ? error : new Error(String(error)),
        { taskId }
      );

      return {
        success: false,
        message: `Integration verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: error instanceof Error ? error.message : "Unknown error",
      } as AgentExecutionOutput;
    }
  }

  private async loadProjectContextData(
    projectId: string
  ): Promise<ProjectContextData> {
    const context = await prisma.projectContext.findUnique({
      where: { projectId },
      select: {
        techStack: true,
        architecture: true,
      },
    });

    if (!context) {
      throw new Error(`Project context not found for ${projectId}`);
    }

    return context as ProjectContextData;
  }

  /**
   * Discover project structure based on tech stack
   */
  private async discoverProjectStructure(
    projectId: string,
    userId: string,
    techStack: {
      frontend?: { framework?: string };
      backend?: { framework?: string };
      [key: string]: unknown;
    }
  ): Promise<{ frontend: string[]; backend: string[]; shared: string[] }> {
    logger.info(`[${this.name}] Discovering project structure`, {
      techStack: techStack?.frontend?.framework,
    });

    // Load entire project structure
    const contextResult = await this.executeTool(
      "context_loader",
      {
        operation: "scan_structure",
        maxFiles: 200,
        maxSize: 1000000,
      },
      { projectId, userId }
    );

    if (!contextResult.success) {
      throw new Error("Failed to load project structure");
    }

    const data = contextResult.data as {
      structure?: {
        files?: Array<{ path: string; size: number; type: string }>;
      };
    };
    const allFiles = data?.structure?.files || [];

    // Categorize files based on tech stack
    const frontend: string[] = [];
    const backend: string[] = [];
    const shared: string[] = [];

    for (const file of allFiles) {
      const path = file.path;

      // Frontend patterns (tech stack agnostic)
      if (
        path.includes("/app/") ||
        path.includes("/pages/") ||
        path.includes("/components/") ||
        path.includes("/src/components/") ||
        path.includes("/views/") ||
        path.includes("/screens/") ||
        path.includes(".tsx") ||
        path.includes(".jsx") ||
        path.includes(".vue") ||
        path.includes(".svelte")
      ) {
        frontend.push(path);
      }
      // Backend patterns (tech stack agnostic)
      else if (
        path.includes("/api/") ||
        path.includes("/server/") ||
        path.includes("/routes/") ||
        path.includes("/controllers/") ||
        path.includes("/handlers/") ||
        path.includes("/services/") ||
        path.includes("/endpoints/") ||
        path.match(/\.(go|rs|java|cs|php|rb|py)$/)
      ) {
        backend.push(path);
      }
      // Shared (types, models, schemas)
      else if (
        path.includes("/types/") ||
        path.includes("/models/") ||
        path.includes("/schemas/") ||
        path.includes("/interfaces/") ||
        path.includes("/entities/")
      ) {
        shared.push(path);
      }
    }

    logger.info(`[${this.name}] Project structure discovered`, {
      frontendFiles: frontend.length,
      backendFiles: backend.length,
      sharedFiles: shared.length,
    });

    return { frontend, backend, shared };
  }

  /**
   * Extract API contracts from frontend code
   */
  private async extractFrontendContracts(
    projectId: string,
    userId: string,
    frontendFiles: string[],
    techStack: {
      frontend?: { framework?: string };
      backend?: { framework?: string };
      [key: string]: unknown;
    }
  ): Promise<Array<{
    endpoint: string;
    method: string;
    file: string;
    line: number;
    requestBody: unknown;
    responseType: string;
    expectedStatus: number[];
  }>> {
    logger.info(`[${this.name}] Extracting frontend API contracts`);

    const contracts: {
      endpoint: string;
      method: string;
      file: string;
      line: number;
      requestBody: unknown;
      responseType: string;
      expectedStatus: number[];
    }[] = [];

    // Use AI to extract API calls from frontend files
    const prompt = `You are analyzing frontend code to extract API contracts.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

Frontend Files:
${frontendFiles.slice(0, 20).join("\n")} ${frontendFiles.length > 20 ? `\n... and ${frontendFiles.length - 20} more` : ""}

Task: Extract all API calls made by the frontend.

For each API call, extract:
1. Endpoint (e.g., "/api/users", "/api/auth/login")
2. HTTP Method (GET, POST, PUT, DELETE, etc.)
3. Expected request body structure (if POST/PUT)
4. Expected response type (if typed)
5. Expected status codes (if handled)
6. File and line number where the call is made

Return JSON array:
[
  {
    "endpoint": "/api/users",
    "method": "GET",
    "file": "src/app/users/page.tsx",
    "line": 15,
    "requestBody": null,
    "responseType": "{ users: User[] }",
    "expectedStatus": [200]
  }
]

Be thorough but only include actual API calls to backend endpoints.
Respond ONLY with valid JSON array, no markdown.`;

    try {
      const text = await this.generateContent(prompt);

      // Parse JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          endpoint: string;
          method: string;
          file: string;
          line: number;
          requestBody: unknown;
          responseType: string;
          expectedStatus: number[];
        }>;
        contracts.push(...parsed);
      }
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to extract frontend contracts`,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    logger.info(`[${this.name}] Extracted ${contracts.length} API contracts`);
    return contracts;
  }

  /**
   * Extract API endpoints from backend code
   */
  private async extractBackendEndpoints(
    projectId: string,
    userId: string,
    backendFiles: string[],
    techStack: ProjectContextData["techStack"]
  ): Promise<Array<{
    endpoint: string;
    method: string;
    file: string;
    line: number;
    requestBodySchema: unknown;
    responseStructure: string;
    statusCodes: number[];
    requiresAuth: boolean;
  }>> {
    logger.info(`[${this.name}] Extracting backend API endpoints`);

    const endpoints: Array<{
      endpoint: string;
      method: string;
      file: string;
      line: number;
      requestBodySchema: unknown;
      responseStructure: string;
      statusCodes: number[];
      requiresAuth: boolean;
    }> = [];

    // Use AI to extract API endpoints from backend files
    const prompt = `You are analyzing backend code to extract API endpoint implementations.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

Backend Files:
${backendFiles.slice(0, 20).join("\n")} ${backendFiles.length > 20 ? `\n... and ${backendFiles.length - 20} more` : ""}

Task: Extract all API endpoint definitions/implementations.

For each endpoint, extract:
1. Endpoint path (e.g., "/api/users", "/api/auth/login")
2. HTTP Method (GET, POST, PUT, DELETE, etc.)
3. Request body schema (if POST/PUT)
4. Response structure/type
5. Status codes returned
6. Authentication required (true/false)
7. File and line number where defined

Return JSON array:
[
  {
    "endpoint": "/api/users",
    "method": "GET",
    "file": "src/app/api/users/route.ts",
    "line": 10,
    "requestBodySchema": null,
    "responseStructure": "{ users: User[] }",
    "statusCodes": [200, 404],
    "requiresAuth": true
  }
]

Be thorough and include all endpoints defined in the backend.
Respond ONLY with valid JSON array, no markdown.`;

    try {
      const text = await this.generateContent(prompt);

      // Parse JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          endpoint: string;
          method: string;
          file: string;
          line: number;
          requestBodySchema: unknown;
          responseStructure: string;
          statusCodes: number[];
          requiresAuth: boolean;
        }>;
        endpoints.push(...parsed);
      }
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to extract backend endpoints`,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    logger.info(
      `[${this.name}] Extracted ${endpoints.length} backend endpoints`
    );
    return endpoints;
  }

  /**
   * Verify frontend contracts match backend endpoints
   */
  private verifyContracts(
    frontendContracts: Array<{
      endpoint: string;
      method: string;
      file: string;
      line: number;
      requestBody: unknown;
      responseType: string;
      expectedStatus: number[];
    }>,
    backendEndpoints: Array<{
      endpoint: string;
      method: string;
      file: string;
      line: number;
      requestBodySchema?: unknown;
      responseStructure?: string;
      statusCodes?: number[];
      requiresAuth?: boolean;
    }>,
    _techStack: ProjectContextData["techStack"]
  ): ContractVerification[] {
    logger.info(`[${this.name}] Verifying API contracts`);

    const verifications: ContractVerification[] = [];

    for (const contract of frontendContracts) {
      // Find matching backend endpoint
      const backendMatch = backendEndpoints.find(
        (ep) =>
          ep.endpoint === contract.endpoint &&
          ep.method.toUpperCase() === contract.method.toUpperCase()
      );

      if (!backendMatch) {
        // Missing endpoint
        verifications.push({
          endpoint: contract.endpoint,
          method: contract.method,
          frontendExpectation: {
            requestBody: contract.requestBody,
            responseType: contract.responseType,
            statusCodes: contract.expectedStatus,
          },
          backendImplementation: {},
          matches: false,
          issues: [
            `Backend endpoint ${contract.method} ${contract.endpoint} not found`,
          ],
        });
        continue;
      }

      // Compare request/response structures
      const issues: string[] = [];

      // Check if request body structures match (if applicable)
      if (contract.requestBody && backendMatch.requestBodySchema) {
        if (contract.requestBody !== backendMatch.requestBodySchema) {
          issues.push(
            `Request body mismatch: Frontend sends ${JSON.stringify(contract.requestBody)}, Backend expects ${JSON.stringify(backendMatch.requestBodySchema)}`
          );
        }
      }

      // Check if response types match
      if (contract.responseType && backendMatch.responseStructure) {
        if (contract.responseType !== backendMatch.responseStructure) {
          issues.push(
            `Response type mismatch: Frontend expects ${contract.responseType}, Backend returns ${backendMatch.responseStructure}`
          );
        }
      }

      // Check status codes
      if (
        contract.expectedStatus &&
        backendMatch.statusCodes &&
        !contract.expectedStatus.some((code: number) =>
          Array.isArray(backendMatch.statusCodes) && backendMatch.statusCodes.includes(code)
        )
      ) {
        issues.push(
          `Status code mismatch: Frontend expects ${contract.expectedStatus.join(", ")}, Backend returns ${backendMatch.statusCodes.join(", ")}`
        );
      }

      verifications.push({
        endpoint: contract.endpoint,
        method: contract.method,
        frontendExpectation: {
          requestBody: contract.requestBody,
          responseType: contract.responseType,
          statusCodes: contract.expectedStatus,
        },
        backendImplementation: {
          actualResponse: backendMatch.responseStructure,
          statusCodes: backendMatch.statusCodes,
          hasAuth: backendMatch.requiresAuth,
        },
        matches: issues.length === 0,
        issues,
      });
    }

    logger.info(`[${this.name}] Contract verification complete`, {
      total: verifications.length,
      matches: verifications.filter((v) => v.matches).length,
      mismatches: verifications.filter((v) => !v.matches).length,
    });

    return verifications;
  }

  /**
   * Verify data models consistency across frontend/backend
   */
  private async verifyDataModels(
    projectId: string,
    userId: string,
    projectFiles: { frontend: string[]; backend: string[]; shared: string[] },
    techStack: ProjectContextData["techStack"]
  ): Promise<IntegrationIssue[]> {
    logger.info(`[${this.name}] Verifying data model consistency`);

    const issues: IntegrationIssue[] = [];

    // Use AI to check if frontend/backend data models match
    const prompt = `You are verifying data model consistency between frontend and backend.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

Frontend Files: ${projectFiles.frontend.join(", ")}
Backend Files: ${projectFiles.backend.join(", ")}
Shared Files: ${projectFiles.shared.join(", ")}

Task: Check if data models (TypeScript interfaces, Zod schemas, database models, etc.) are consistent across frontend and backend.

Common issues to look for:
1. Frontend interface has fields not returned by backend
2. Backend model has required fields frontend doesn't use
3. Type mismatches (string vs number, etc.)
4. Missing validation between frontend and backend
5. Database schema doesn't match backend types

Return JSON array of issues found:
[
  {
    "severity": "high",
    "category": "type_mismatch",
    "frontendFile": "src/types/user.ts",
    "frontendLine": 5,
    "frontendExpects": "age: string",
    "backendFile": "src/models/user.ts",
    "backendLine": 10,
    "backendProvides": "age: number",
    "description": "User age type mismatch between frontend and backend",
    "suggestion": "Change frontend User interface to use age: number instead of string"
  }
]

If no issues found, return empty array [].
Respond ONLY with valid JSON array, no markdown.`;

    try {
      const text = await this.generateContent(prompt);

      // Parse JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const rawParsed = JSON.parse(jsonMatch[0]) as Array<{
          severity?: string;
          category?: string;
          frontendFile?: string;
          frontendLine?: number;
          frontendExpects?: string;
          backendFile?: string;
          backendLine?: number;
          backendProvides?: string;
          description?: string;
          suggestion?: string;
        }>;
        if (Array.isArray(rawParsed)) {
          for (const issue of rawParsed) {
            if (
              typeof issue === "object" &&
              issue !== null &&
              (typeof issue.severity === "string" || typeof issue.severity === "undefined") &&
              (typeof issue.category === "string" || typeof issue.category === "undefined")
            ) {
              issues.push({
                severity: (["critical", "high", "medium", "low"].includes(issue.severity as string) ? issue.severity as IntegrationIssue["severity"] : "medium"),
                category: (["timeout", "contract_mismatch", "auth_failure", "type_mismatch", "missing_endpoint", "data_model_mismatch", "cors_issue", "error_handling"].includes(issue.category as string)
                  ? issue.category as IntegrationIssue["category"]
                  : "data_model_mismatch"),
                frontend: {
                  file: issue.frontendFile || "",
                  line: issue.frontendLine || 0,
                  expects: issue.frontendExpects || "",
                },
                backend: {
                  file: issue.backendFile || "",
                  line: issue.backendLine || 0,
                  provides: issue.backendProvides || "",
                },
                description: issue.description || "",
                suggestion: issue.suggestion || "",
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to verify data models`,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    logger.info(`[${this.name}] Found ${issues.length} data model issues`);
    return issues;
  }

  /**
   * Run integration tests for detected mismatches
   */
  private async runIntegrationTests(
    projectId: string,
    userId: string,
    failedContracts: ContractVerification[],
    techStack: ProjectContextData["techStack"]
  ): Promise<FlowTestResult[]> {
    logger.info(`[${this.name}] Running integration tests`);

    const flowTests: FlowTestResult[] = [];

    // Only run tests if there are integration test scripts
    const testCommand = this.detectIntegrationTestCommand(techStack);

    if (!testCommand) {
      logger.info(
        `[${this.name}] No integration test command detected, skipping flow tests`
      );
      return flowTests;
    }

    // Run integration tests
    const testResult = await this.executeTool(
      "command",
      {
        command: testCommand,
        timeout: 300, // 5 minutes for integration tests
      },
      { projectId, userId }
    );

    if (testResult.success) {
      // Parse test results
      const testData = testResult.data as { durationMs?: number };
      flowTests.push({
        testName: "Integration Test Suite",
        flow: "Full Integration Tests",
        steps: [
          {
            step: "Run integration tests",
            passed: true,
            error: undefined,
          },
        ],
        passed: true,
        duration: testData?.durationMs || 0,
      });
    } else {
      const testData = testResult.data as { durationMs?: number };
      flowTests.push({
        testName: "Integration Test Suite",
        flow: "Full Integration Tests",
        steps: [
          {
            step: "Run integration tests",
            passed: false,
            error: testResult.error || "Integration tests failed",
          },
        ],
        passed: false,
        duration: testData?.durationMs || 0,
      });
    }

    return flowTests;
  }

  /**
   * Detect integration test command based on tech stack
   */
  private detectIntegrationTestCommand(techStack: ProjectContextData["techStack"]): string | null {
    const frontend = techStack?.frontend?.framework?.toLowerCase() || "";
    const backend = techStack?.backend?.framework?.toLowerCase() || "";

    // Check for common integration test patterns
    if (frontend.includes("next") || frontend.includes("react")) {
      return "npm run test:integration || npm run test:e2e || npm run test";
    }

    if (backend.includes("node") || backend.includes("express")) {
      return "npm run test:integration || npm run test:api || npm run test";
    }

    if (
      backend.includes("python") ||
      backend.includes("django") ||
      backend.includes("flask")
    ) {
      return "pytest tests/integration/ || python -m pytest";
    }

    if (backend.includes("go")) {
      return "go test ./... -tags=integration";
    }

    if (backend.includes("rust")) {
      return "cargo test --test integration";
    }

    if (backend.includes("java") || backend.includes("spring")) {
      return "mvn test -Dtest=*IntegrationTest || gradle test";
    }

    return null;
  }

  /**
   * Convert contract verifications to issues
   */
  private contractVerificationsToIssues(
    verifications: ContractVerification[]
  ): IntegrationIssue[] {
    const issues: IntegrationIssue[] = [];

    for (const verification of verifications) {
      if (!verification.matches) {
        for (const issueText of verification.issues) {
          let category: IntegrationIssue["category"] = "contract_mismatch";
          let severity: IntegrationIssue["severity"] = "high";

          if (issueText.includes("not found")) {
            category = "missing_endpoint";
            severity = "critical";
          } else if (issueText.includes("Request body")) {
            category = "type_mismatch";
          } else if (issueText.includes("Response type")) {
            category = "type_mismatch";
          } else if (issueText.includes("Status code")) {
            category = "contract_mismatch";
            severity = "medium";
          }

          issues.push({
            severity,
            category,
            frontend: {
              file: "", // Would need to track from contract extraction
              line: 0,
              expects: verification.frontendExpectation.responseType || "",
            },
            backend: {
              file: "",
              line: 0,
              provides: typeof verification.backendImplementation.actualResponse === "string"
                ? verification.backendImplementation.actualResponse
                : JSON.stringify(verification.backendImplementation.actualResponse ?? ""),
            },
            description: issueText,
            suggestion: this.generateIssueSuggestion(category, issueText),
          });
        }
      }
    }

    return issues;
  }

  /**
   * Generate suggestion for fixing an issue
   */
  private generateIssueSuggestion(
    category: IntegrationIssue["category"],
    _issueText: string
  ): string {
    switch (category) {
      case "missing_endpoint":
        return "Implement the missing backend endpoint or remove the frontend call";
      case "type_mismatch":
        return "Update either frontend or backend types to match the expected contract";
      case "contract_mismatch":
        return "Align the API contract between frontend and backend implementations";
      case "auth_failure":
        return "Ensure authentication middleware is properly configured on both ends";
      default:
        return "Review the integration contract and align frontend/backend implementations";
    }
  }

  /**
   * Generate recommendations based on issues
   */
  private generateRecommendations(
    issues: IntegrationIssue[],
    _techStack: ProjectContextData["techStack"]
  ): string[] {
    const recommendations: string[] = [];

    const criticalCount = issues.filter(
      (i) => i.severity === "critical"
    ).length;
    const highCount = issues.filter((i) => i.severity === "high").length;

    if (criticalCount > 0) {
      recommendations.push(
        `Fix ${criticalCount} critical integration issue(s) before deployment`
      );
    }

    if (highCount > 5) {
      recommendations.push(
        "Consider adding integration tests to catch contract mismatches earlier"
      );
    }

    // Type safety recommendations
    const typeMismatches = issues.filter((i) => i.category === "type_mismatch");
    if (typeMismatches.length > 0) {
      recommendations.push(
        "Use shared type definitions (e.g., monorepo with shared types package) to prevent type mismatches"
      );
    }

    // Missing endpoints
    const missingEndpoints = issues.filter(
      (i) => i.category === "missing_endpoint"
    );
    if (missingEndpoints.length > 0) {
      recommendations.push(
        `Implement ${missingEndpoints.length} missing backend endpoint(s) or remove unused frontend calls`
      );
    }

    // Auth issues
    const authIssues = issues.filter((i) => i.category === "auth_failure");
    if (authIssues.length > 0) {
      recommendations.push(
        "Review authentication middleware configuration on both frontend and backend"
      );
    }

    // General recommendations
    if (issues.length > 10) {
      recommendations.push(
        "Consider using API specification tools (OpenAPI/Swagger) to define and validate contracts"
      );
    }

    return recommendations;
  }

  /**
   * Calculate integration metrics
   */
  private calculateMetrics(
    verifications: ContractVerification[],
    issues: IntegrationIssue[],
    flowTests: FlowTestResult[]
  ): IntegrationVerificationResult["metrics"] {
    const totalEndpoints = verifications.length;
    const verifiedEndpoints = verifications.filter((v) => v.matches).length;
    const mismatches = verifications.filter((v) => !v.matches).length;
    const criticalIssues = issues.filter(
      (i) => i.severity === "critical"
    ).length;

    // Calculate compatibility score (0-100)
    let compatibilityScore = 100;

    // Deduct points for mismatches
    compatibilityScore -= mismatches * 5; // -5 per mismatch

    // Deduct points for issues
    compatibilityScore -= criticalIssues * 20; // -20 per critical
    compatibilityScore -=
      issues.filter((i) => i.severity === "high").length * 10; // -10 per high
    compatibilityScore -=
      issues.filter((i) => i.severity === "medium").length * 5; // -5 per medium

    // Deduct points for failed flow tests
    const failedFlowTests = flowTests.filter((ft) => !ft.passed).length;
    compatibilityScore -= failedFlowTests * 15; // -15 per failed flow test

    // Ensure score doesn't go below 0
    compatibilityScore = Math.max(0, compatibilityScore);

    return {
      totalEndpoints,
      verifiedEndpoints,
      mismatches,
      criticalIssues,
      compatibilityScore,
    };
  }

  /**
   * Store verification results in database
   */
  private async storeVerificationResults(
    taskId: string,
    projectId: string,
    result: IntegrationVerificationResult
  ): Promise<void> {
    try {
      await prisma.agentTask.update({
        where: { id: taskId },
        data: {
          output: JSON.stringify(result),
          status: result.compatible ? "completed" : "failed",
          completedAt: new Date(),
        },
      });

      logger.info(`[${this.name}] Stored verification results`, { taskId });
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to store results`,
        error instanceof Error ? error : new Error(String(error)),
        { taskId }
      );
    }
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const integrationAgent = new IntegrationAgent();
