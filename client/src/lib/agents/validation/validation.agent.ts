// src/lib/agents/validation/validation-agent.ts
/**
 * Validation Agent
 * Assesses feasibility, identifies risks, validates tech choices, and estimates timelines
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AI_MODELS } from "@/lib/models";
import { toError } from "@/lib/error-utils";
import { createThoughtStream } from "@/lib/agents/thought-stream";
import { env } from "@/lib/env";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface ValidationInput {
  projectId: string;
  userId: string;
  conversationId: string;
}

export interface FeasibilityScore {
  technical: number; // 0-10
  market: number; // 0-10
  timeline: number; // 0-10
  resources: number; // 0-10
  overall: number; // 0-10
}

export interface Risk {
  severity: "low" | "medium" | "high" | "critical";
  category:
    | "technical"
    | "market"
    | "legal"
    | "security"
    | "scalability"
    | "resources";
  description: string;
  mitigation: string;
}

export interface TechValidation {
  recommended: string[];
  alternatives: string[];
  deprecated: string[];
  concerns: string[];
}

export interface TimelineEstimate {
  optimistic: string; // e.g., "8 weeks"
  realistic: string; // e.g., "12 weeks"
  conservative: string; // e.g., "16 weeks"
}

export interface ValidationResult {
  feasible: boolean;
  feasibilityScore: FeasibilityScore;
  risks: Risk[];
  techValidation: TechValidation;
  timeline: TimelineEstimate;
  recommendations: string[];
  blockers: string[];
  confidenceLevel: number; // 0-100
}

export interface ValidationOutput {
  success: boolean;
  message: string;
  result?: ValidationResult;
  executionId?: string;
}

// ==========================================
// VALIDATION AGENT CLASS
// ==========================================

/**
 * Validation Agent - AI-Powered Feasibility Assessment
 *
 * CAPABILITIES:
 * ✅ Technical Feasibility Analysis - Evaluates project technical viability
 * ✅ Risk Assessment - Identifies potential blockers and challenges
 * ✅ Resource Estimation - Calculates timeline and resource requirements
 * ✅ Market Viability - Assesses market opportunity and competition
 * ✅ Technology Validation - Reviews tech stack choices for compatibility
 *
 * Uses Google Gemini Pro for comprehensive validation analysis
 *
 * This agent ensures projects are:
 * - Technically feasible with available resources
 * - Properly scoped with realistic timelines
 * - Validated against potential risks
 * - Ready for planning and execution
 */
export class ValidationAgent {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  public readonly name = "ValidationAgent";
  public readonly phase = "validation";

  constructor() {
    const apiKey = env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for ValidationAgent");
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: AI_MODELS.PRIMARY,
      generationConfig: {
        temperature: 0.3, // Lower for consistent validation
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
    });
  }

  /**
   * Main execution method
   */
  async execute(input: ValidationInput): Promise<ValidationOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting validation for project ${input.projectId}`
    );

    // Create thought stream
    const thoughts = createThoughtStream(input.projectId, this.name);

    try {
      await thoughts.starting("feasibility validation and risk assessment");

      // Step 1: Get project context
      await thoughts.accessing(
        "ProjectContext database",
        "Retrieving project blueprint and tech stack"
      );
      const context = await this.getProjectContext(input.projectId);

      if (!context) {
        await thoughts.error(
          "Project context not found - Previous agents must complete first"
        );
        throw new Error(
          "Project context not found. Run Analyzer and Research agents first."
        );
      }

      await thoughts.analyzing("project requirements and proposed tech stack");

      // Step 2: Generate validation prompt
      await thoughts.thinking("building comprehensive validation criteria");
      const prompt = this.buildValidationPrompt(context);

      // Step 3: Get AI validation analysis
      await thoughts.accessing(
        "Google Gemini AI",
        "Requesting feasibility assessment"
      );
      logger.info(`[${this.name}] Requesting AI validation analysis...`);
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      // Step 4: Parse AI response
      await thoughts.analyzing("AI validation results and risk factors");
      const validation = this.parseValidationResponse(responseText);

      await thoughts.emit(
        "analyzing",
        `Feasibility score: ${validation.feasibilityScore.overall}/10`,
        {
          feasible: validation.feasible,
          risks: validation.risks.length,
          blockers: validation.blockers.length,
        }
      );

      // Step 5: Store results in database
      await thoughts.accessing("database", "Storing validation results");
      await this.storeValidationResults(input.projectId, validation);

      // Step 6: Log execution
      const duration = Date.now() - startTime;
      await thoughts.executing("logging validation execution");
      const executionId = await this.logExecution(
        input,
        validation,
        true,
        duration
      );

      await thoughts.completing(
        validation.feasible
          ? `Project validated as feasible (score: ${validation.feasibilityScore.overall}/10) in ${duration}ms`
          : `Project has concerns (${validation.blockers.length} blockers found) in ${duration}ms`
      );

      logger.info(`[${this.name}] Validation completed`, {
        projectId: input.projectId,
        feasible: validation.feasible,
        overallScore: validation.feasibilityScore.overall,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        message: validation.feasible
          ? "Project is feasible! Ready to proceed to planning phase."
          : "Project has significant concerns. Review blockers before proceeding.",
        result: validation,
        executionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const duration = Date.now() - startTime;

      await thoughts.error(errorMessage, {
        error: error instanceof Error ? error.stack : String(error),
      });

      logger.error(`[${this.name}] Validation failed:`, toError(error));

      await this.logExecution(input, null, false, duration, errorMessage);

      return {
        success: false,
        message: `Validation failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Get project context from database
   */
  private async getProjectContext(projectId: string) {
    const context = await prisma.projectContext.findUnique({
      where: { projectId },
    });

    if (!context) {
      return null;
    }

    interface Architecture {
      validation?: ValidationResult;
      [key: string]: unknown;
    }
    // Parse architecture if it's stored as JSON string
    let architecture: Architecture | null = null;
    if (context.architecture) {
      try {
        architecture = typeof context.architecture === 'string'
          ? JSON.parse(context.architecture) as Architecture
          : context.architecture as Architecture;
      } catch (error) {
        logger.warn(`[${this.name}] Failed to parse architecture JSON`, {
          projectId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    const validation = architecture?.validation;

    const blueprint = context.blueprint as unknown;
    let rawBlueprint: string | object;
    if (
      blueprint &&
      typeof blueprint === "object" &&
      "raw" in blueprint &&
      typeof (blueprint as { raw?: unknown }).raw === "string"
    ) {
      rawBlueprint = (blueprint as { raw: string }).raw;
    } else {
      rawBlueprint = blueprint as string | object;
    }

    return {
      blueprint: rawBlueprint, // Use raw text, not parsed object
      techStack: context.techStack,
      validation: validation,
    };
  }

  /**
   * Build validation prompt for AI
   */
  private buildValidationPrompt(context: {
    blueprint?: unknown;
    techStack?: unknown;
  }): string {
    const blueprint = context.blueprint ?? {};
    const techStack = context.techStack ?? {};

    return `
You are a technical validation expert. Analyze this project and provide a comprehensive feasibility assessment.

PROJECT BLUEPRINT:
${JSON.stringify(blueprint, null, 2)}

RECOMMENDED TECH STACK:
${JSON.stringify(techStack, null, 2)}

Provide a detailed validation analysis in the following JSON format:

{
  "feasible": boolean,
  "feasibilityScore": {
    "technical": number (0-10, how technically feasible),
    "market": number (0-10, market viability),
    "timeline": number (0-10, timeline realism),
    "resources": number (0-10, resource availability),
    "overall": number (0-10, weighted average)
  },
  "risks": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "category": "technical" | "market" | "legal" | "security" | "scalability" | "resources",
      "description": "detailed risk description",
      "mitigation": "how to mitigate this risk"
    }
  ],
  "techValidation": {
    "recommended": ["list of recommended technologies"],
    "alternatives": ["alternative technologies to consider"],
    "deprecated": ["any deprecated/problematic choices"],
    "concerns": ["any technical concerns"]
  },
  "timeline": {
    "optimistic": "X weeks/months (best case)",
    "realistic": "Y weeks/months (most likely)",
    "conservative": "Z weeks/months (worst case)"
  },
  "recommendations": [
    "actionable recommendation 1",
    "actionable recommendation 2"
  ],
  "blockers": [
    "critical blocker that must be resolved"
  ],
  "confidenceLevel": number (0-100, how confident in this assessment)
}

IMPORTANT:
- Be honest and thorough
- Identify real risks, not theoretical ones
- Provide actionable recommendations
- Mark as feasible (true) if overall score >= 6.0
- Only add blockers for truly critical issues that would prevent launch
- Most projects should be feasible with proper execution
- Consider the target user level and resources
- Respond with ONLY valid JSON, no markdown or explanations
`.trim();
  }

  /**
   * Parse AI response into structured validation result
   */
  private parseValidationResponse(responseText: string): ValidationResult {
    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const parsed = JSON.parse(cleanedText) as ValidationResult;

      // Validate required fields
      if (!parsed.feasible === undefined || !parsed.feasibilityScore) {
        throw new Error("Invalid validation response format");
      }

      return parsed;
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to parse AI response:`,
        error instanceof Error ? error : undefined
      );
      throw new Error(
        "Failed to parse validation response. AI returned invalid format."
      );
    }
  }

  /**
   * Store validation results in database
   */
  private async storeValidationResults(
    projectId: string,
    validation: ValidationResult
  ): Promise<void> {
    await prisma.projectContext.update({
      where: { projectId },
      data: {
        architecture: JSON.stringify({
          validation: validation,
          validatedAt: new Date().toISOString(),
        }),
        currentPhase: validation.feasible ? "planning" : "validation",
        updatedAt: new Date(),
      },
    });

    logger.info(`[${this.name}] Stored validation results in ProjectContext`);
  }

  /**
   * Log execution to AgentExecution table
   */
  private async logExecution(
    input: ValidationInput,
    validation: ValidationResult | null,
    success: boolean,
    durationMs: number,
    error?: string
  ): Promise<string> {
    const execution = await prisma.agentExecution.create({
      data: {
        projectId: input.projectId,
        agentName: this.name,
        phase: this.phase,
        input: input ? (input as unknown as import("@prisma/client").Prisma.InputJsonValue) : {},
        output: validation ? JSON.stringify(validation) : undefined,
        success,
        durationMs,
        error,
      },
    });

    return execution.id;
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.model.generateContent("Test");
      return !!result;
    } catch {
      return false;
    }
  }
}

// ==========================================
// EXPORT SINGLETON INSTANCE
// ==========================================

export const validationAgent = new ValidationAgent();
