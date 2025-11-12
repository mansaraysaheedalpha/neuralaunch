// src/lib/agents/planning/planning-agent.ts
/**
 * Enhanced Planning Agent with Dual-Mode Support
 * - Vision Mode: Converts freeform vision text into technical plans
 * - Blueprint Mode: Parses structured blueprints with validation data
 * - Uses Claude (Anthropic) for superior JSON generation
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AI_MODELS } from "@/lib/models";
import { toError } from "@/lib/error-utils";
import { createThoughtStream } from "@/lib/agents/thought-stream";
import {
  executeWithExtendedThinking,
  buildChainOfThoughtPrompt,
  parseChainOfThought,
} from "@/lib/agents/extended-thinking";


// ==========================================
// TYPES & INTERFACES
// ==========================================

// Base interface for common fields
interface BasePlanningInput {
  projectId: string;
  userId: string;
  conversationId: string;
}

// Vision-based planning (from Agentic Interface)
export interface VisionPlanningInput extends BasePlanningInput {
  sourceType: "vision";
  visionText: string;
  projectName: string;
  techPreferences?: {
    frontend?: string;
    backend?: string;
    database?: string;
    deployment?: string;
  };
}

// Blueprint-based planning (from SprintDashboard)
export interface BlueprintPlanningInput extends BasePlanningInput {
  sourceType: "blueprint";
  blueprint: string;
  sprintData?: {
    completedTasks: any[];
    analytics: any;
    validationResults: any;
  };
}

// Union type for all planning inputs
export type PlanningInput = VisionPlanningInput | BlueprintPlanningInput;

// Legacy interface for backward compatibility
export interface LegacyPlanningInput {
  projectId: string;
  userId: string;
  conversationId: string;
}

export interface AtomicTask {
  id: string;
  title: string;
  description: string;
  category:
    | "frontend"
    | "backend"
    | "database"
    | "devops"
    | "integration"
    | "testing";
  priority: number;
  estimatedHours: number;
  estimatedLines: number;
  complexity: "simple" | "medium";
  dependencies: string[];
  technicalDetails: {
    files: string[];
    technologies: string[];
    endpoints?: string[];
    components?: string[];
  };
  acceptanceCriteria: string[];
}

export interface TechnicalArchitecture {
  projectStructure: {
    directories: string[];
    rootFiles: string[];
  };
  frontendArchitecture?: {
    framework: string;
    stateManagement: string;
    routing: string;
    styling: string;
    keyComponents: string[];
  };
  backendArchitecture?: {
    framework: string;
    apiPattern: string;
    authentication: string;
    keyEndpoints: string[];
  };
  databaseArchitecture?: {
    type: string;
    orm: string;
    keyModels: string[];
    relationships: string[];
  };
  infrastructureArchitecture?: {
    hosting: string;
    cicd: string;
    monitoring: string;
    scaling: string;
  };
}

export interface ExecutionPlan {
  architecture: TechnicalArchitecture;
  tasks: AtomicTask[];
  phases: {
    name: string;
    taskIds: string[];
    estimatedDuration: string;
  }[];
  totalEstimatedHours: number;
  criticalPath: string[];
}

export interface PlanningOutput {
  success: boolean;
  message: string;
  plan?: ExecutionPlan;
  executionId?: string;
}

// Extended thinking options for enhanced transparency
export interface PlanningOptions {
  enableDeepDive?: boolean; // Show raw AI reasoning
  useExtendedThinking?: boolean; // Use Claude's extended thinking feature
  useChainOfThought?: boolean; // Force step-by-step reasoning
}

// ==========================================
// PLANNING AGENT CLASS
// ==========================================

export class PlanningAgent {
  private anthropic: Anthropic;
  private openai: OpenAI;
  public readonly name = "PlanningAgent";
  public readonly phase = "planning";

  constructor() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is required for PlanningAgent");
    }

    // Initialize OpenAI (primary for JSON generation)
    this.openai = new OpenAI({
      apiKey: openaiKey,
      timeout: 180000,
      maxRetries: 2,
    });

    // Keep Anthropic as fallback if needed
    if (anthropicKey) {
      this.anthropic = new Anthropic({
        apiKey: anthropicKey,
        timeout: 30 * 60 * 1000,
        maxRetries: 2,
      });
    } else {
      // Create a stub that throws if used
      this.anthropic = null as any;
    }
  }
  /**
   * Main execution method - Routes to vision or blueprint planning
   */
  async execute(
    input: PlanningInput | LegacyPlanningInput,
    options?: PlanningOptions
  ): Promise<PlanningOutput> {
    const startTime = Date.now();

    // Type guard to determine input type
    if ("sourceType" in input) {
      if (input.sourceType === "vision") {
        logger.info(
          `[${this.name}] Vision-based planning for ${input.projectId}`
        );
        return await this.executeVisionPlanning(input, options);
      } else if (input.sourceType === "blueprint") {
        logger.info(
          `[${this.name}] Blueprint-based planning for ${input.projectId}`
        );
        return await this.executeBlueprintPlanning(input, options);
      }
    }

    // Legacy flow - treat as blueprint without validation data
    logger.info(`[${this.name}] Legacy planning flow for ${input.projectId}`);
    return await this.executeLegacyPlanning(input as LegacyPlanningInput, options);
  }

  /**
   * VISION PLANNING MODE
   * Converts freeform vision text into technical execution plan
   */
  private async executeVisionPlanning(
    input: VisionPlanningInput,
    options?: PlanningOptions
  ): Promise<PlanningOutput> {
    const startTime = Date.now();

    // Extract options with defaults
    const {
      enableDeepDive = false,
      useExtendedThinking = false,
      useChainOfThought = false,
    } = options || {};

    // Create thought stream with deep dive support
    const thoughts = createThoughtStream(input.projectId, this.name, enableDeepDive);

    try {
      await thoughts.starting("vision-based execution planning");

      logger.info(`[${this.name}] Starting vision planning`, {
        projectId: input.projectId,
        projectName: input.projectName,
        hasTechPreferences: !!input.techPreferences,
      });

      // Step 1: Analyze vision text with AI
      await thoughts.analyzing("project vision and extracting core features");
      const analysis = await this.analyzeVision(input.visionText, thoughts);

      // Step 2: Extract technical requirements
      await thoughts.thinking("technical requirements based on vision");
      const requirements = await this.extractRequirements(analysis, input);

      // Step 3: Design architecture
      await thoughts.deciding("optimal technical architecture");
      const architecture = await this.designArchitecture(
        requirements,
        input.techPreferences,
        thoughts
      );

      // Step 4: Generate execution plan
      await thoughts.thinking("building comprehensive execution plan prompt");
      const prompt = this.buildVisionPlanningPrompt(
        input,
        analysis,
        architecture
      );

      await thoughts.accessing(
        "Claude AI",
        "Generating detailed task breakdown"
      );
      logger.info(`[${this.name}] Generating vision-based execution plan...`);
      
      let responseText: string;
      let rawThinking: string | undefined;

      // Use extended thinking or chain-of-thought if enabled
      if (useExtendedThinking && this.anthropic) {
        await thoughts.thinking("Using extended thinking for deep analysis");
        const result = await executeWithExtendedThinking({
          thoughts,
          prompt,
          thinkingBudget: 10000,
          parseSteps: true,
        });
        responseText = result.answer;
        rawThinking = result.thinking;

        await thoughts.emit("analyzing", "Extended thinking complete", {
          thinkingTokens: result.thinkingTokens,
          outputTokens: result.outputTokens,
          thinkingLength: result.thinking.length,
        });
      } else if (useChainOfThought) {
        await thoughts.thinking("Using chain-of-thought reasoning");
        const cotPrompt = buildChainOfThoughtPrompt(prompt);
        const fullResponse = await this.callClaude(cotPrompt, thoughts);
        responseText = await parseChainOfThought(fullResponse, thoughts);
      } else {
        responseText = await this.callClaude(prompt, thoughts);
      }

      // Step 5: Parse and validate plan
      await thoughts.analyzing("AI response and validating plan structure");
      const plan = this.parsePlanningResponse(responseText);
      this.validatePlan(plan);

      await thoughts.emit(
        "analyzing",
        `Generated ${plan.tasks.length} atomic tasks across ${plan.phases.length} phases`,
        {
          taskCount: plan.tasks.length,
          phaseCount: plan.phases.length,
        }
      );

      // Step 6: Store results
      await thoughts.accessing("database", "Storing execution plan");
      await this.storePlanningResults(input.projectId, plan, "vision", {
        visionText: input.visionText,
        projectName: input.projectName,
        analysis,
      }, rawThinking);

      await thoughts.executing("creating agent task records");
      await this.createAgentTasks(input.projectId, plan.tasks);

      const duration = Date.now() - startTime;
      await thoughts.executing("logging planning execution");
      const executionId = await this.logExecution(input, plan, true, duration);

      await thoughts.completing(
        `Vision planning complete with ${plan.tasks.length} tasks in ${duration}ms`
      );

      logger.info(`[${this.name}] Vision planning completed`, {
        taskCount: plan.tasks.length,
        phases: plan.phases.length,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        message: `Vision analyzed! Generated ${plan.tasks.length} tasks to build "${input.projectName}".`,
        plan,
        executionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const duration = Date.now() - startTime;

      await thoughts.error(errorMessage, {
        error: error instanceof Error ? error.stack : String(error),
      });

      logger.error(`[${this.name}] Vision planning failed:`, toError(error));

      await this.logExecution(input, null, false, duration, errorMessage);

      return {
        success: false,
        message: `Vision planning failed: ${errorMessage}`,
      };
    }
  }

  /**
   * BLUEPRINT PLANNING MODE
   * Parses structured blueprint with optional sprint validation data
   */
  private async executeBlueprintPlanning(
    input: BlueprintPlanningInput,
    options?: PlanningOptions
  ): Promise<PlanningOutput> {
    const startTime = Date.now();

    // Extract options with defaults
    const {
      enableDeepDive = false,
      useExtendedThinking = false,
      useChainOfThought = false,
    } = options || {};

    try {
      logger.info(`[${this.name}] Starting blueprint planning`, {
        projectId: input.projectId,
        hasSprintData: !!input.sprintData,
      });

      // Create thought stream with deep dive support
      const thoughts = createThoughtStream(input.projectId, this.name, enableDeepDive);
      await thoughts.starting("blueprint-based execution planning");

      // Step 1: Parse blueprint structure
      await thoughts.analyzing("blueprint structure");
      const parsed = await this.parseBlueprint(input.blueprint);

      // Step 2: Integrate sprint validation data (if available)
      if (input.sprintData) {
        await thoughts.thinking("integrating sprint validation data");
      }
      const enhanced = input.sprintData
        ? await this.enhanceWithSprintData(parsed, input.sprintData)
        : parsed;

      // Step 3: Generate execution plan
      await thoughts.thinking("building comprehensive execution plan prompt");
      const prompt = this.buildBlueprintPlanningPrompt(
        input.blueprint,
        enhanced,
        input.sprintData
      );

      await thoughts.accessing("Claude AI", "Generating detailed task breakdown");
      logger.info(
        `[${this.name}] Generating blueprint-based execution plan...`
      );
      
      let responseText: string;
      let rawThinking: string | undefined;

      // Use extended thinking or chain-of-thought if enabled
      if (useExtendedThinking && this.anthropic) {
        await thoughts.thinking("Using extended thinking for deep analysis");
        const result = await executeWithExtendedThinking({
          thoughts,
          prompt,
          thinkingBudget: 10000,
          parseSteps: true,
        });
        responseText = result.answer;
        rawThinking = result.thinking;

        await thoughts.emit("analyzing", "Extended thinking complete", {
          thinkingTokens: result.thinkingTokens,
          outputTokens: result.outputTokens,
          thinkingLength: result.thinking.length,
        });
      } else if (useChainOfThought) {
        await thoughts.thinking("Using chain-of-thought reasoning");
        const cotPrompt = buildChainOfThoughtPrompt(prompt);
        const fullResponse = await this.callClaude(cotPrompt, thoughts);
        responseText = await parseChainOfThought(fullResponse, thoughts);
      } else {
        responseText = await this.callClaude(prompt, thoughts);
      }

      // Step 4: Parse and validate plan
      await thoughts.analyzing("AI response and validating plan structure");
      const plan = this.parsePlanningResponse(responseText);
      this.validatePlan(plan);

      await thoughts.emit(
        "analyzing",
        `Generated ${plan.tasks.length} atomic tasks across ${plan.phases.length} phases`,
        {
          taskCount: plan.tasks.length,
          phaseCount: plan.phases.length,
        }
      );

      // Step 5: Store results
      await thoughts.accessing("database", "Storing execution plan");
      await this.storePlanningResults(input.projectId, plan, "blueprint", {
        blueprint: input.blueprint,
        sprintData: input.sprintData,
      }, rawThinking);

      await thoughts.executing("creating agent task records");
      await this.createAgentTasks(input.projectId, plan.tasks);

      const duration = Date.now() - startTime;
      await thoughts.executing("logging planning execution");
      const executionId = await this.logExecution(input, plan, true, duration);

      await thoughts.completing(
        `Blueprint planning complete with ${plan.tasks.length} tasks in ${duration}ms`
      );

      logger.info(`[${this.name}] Blueprint planning completed`, {
        taskCount: plan.tasks.length,
        phases: plan.phases.length,
        sprintDataUsed: !!input.sprintData,
        useExtendedThinking,
        useChainOfThought,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        message: `Blueprint analyzed! Generated ${plan.tasks.length} tasks${
          input.sprintData ? " prioritized by validation data" : ""
        }.`,
        plan,
        executionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const duration = Date.now() - startTime;

      logger.error(`[${this.name}] Blueprint planning failed:`, toError(error));

      await this.logExecution(input, null, false, duration, errorMessage);

      return {
        success: false,
        message: `Blueprint planning failed: ${errorMessage}`,
      };
    }
  }

  /**
   * LEGACY PLANNING MODE (backward compatibility)
   * Uses existing ProjectContext flow
   */
  private async executeLegacyPlanning(
    input: LegacyPlanningInput,
    options?: PlanningOptions
  ): Promise<PlanningOutput> {
    const startTime = Date.now();

    // Extract options with defaults
    const {
      enableDeepDive = false,
      useExtendedThinking = false,
      useChainOfThought = false,
    } = options || {};

    // Create thought stream with deep dive support
    const thoughts = createThoughtStream(input.projectId, this.name, enableDeepDive);

    try {
      await thoughts.starting("blueprint-based execution planning");

      logger.info(
        `[${this.name}] Starting legacy planning for project ${input.projectId}`
      );

      // Step 1: Get project context (blueprint, tech stack, validation)
      await thoughts.accessing(
        "ProjectContext database",
        "Retrieving project data"
      );
      const context = await this.getProjectContext(input.projectId);

      if (!context) {
        await thoughts.error(
          "Project context not found - Previous agents must complete first"
        );
        throw new Error(
          "Project context not found. Run previous agents first."
        );
      }

      if (!context.validation) {
        await thoughts.error(
          "Validation results missing - Validation agent must run first"
        );
        throw new Error(
          "Validation results not found. Run Validation Agent first."
        );
      }

      // Step 2: Check if project is feasible
      await thoughts.analyzing("validation results and feasibility");
      if (!context.validation.feasible) {
        await thoughts.error(
          "Project not feasible - Blockers must be addressed first"
        );
        throw new Error(
          "Project is not feasible according to validation. Address blockers first."
        );
      }

      await thoughts.deciding("Project is feasible - proceeding with planning");

      // Step 3: Generate planning prompt (using existing blueprint logic)
      await thoughts.thinking("building comprehensive execution plan");
      const prompt = this.buildLegacyPlanningPrompt(context);

      // Step 4: Get AI planning analysis
      await thoughts.accessing(
        "Claude AI",
        "Generating atomic tasks and phases"
      );
      logger.info(`[${this.name}] Requesting AI planning analysis...`);
      
      let responseText: string;
      let rawThinking: string | undefined;

      // Use extended thinking or chain-of-thought if enabled
      if (useExtendedThinking && this.anthropic) {
        await thoughts.thinking("Using extended thinking for deep analysis");
        const result = await executeWithExtendedThinking({
          thoughts,
          prompt,
          thinkingBudget: 10000,
          parseSteps: true,
        });
        responseText = result.answer;
        rawThinking = result.thinking;

        await thoughts.emit("analyzing", "Extended thinking complete", {
          thinkingTokens: result.thinkingTokens,
          outputTokens: result.outputTokens,
          thinkingLength: result.thinking.length,
        });
      } else if (useChainOfThought) {
        await thoughts.thinking("Using chain-of-thought reasoning");
        const cotPrompt = buildChainOfThoughtPrompt(prompt);
        const fullResponse = await this.callClaude(cotPrompt, thoughts);
        responseText = await parseChainOfThought(fullResponse, thoughts);
      } else {
        responseText = await this.callClaude(prompt, thoughts);
      }

      // Step 5: Parse AI response
      await thoughts.analyzing("AI response and extracting plan structure");
      const plan = this.parsePlanningResponse(responseText);

      // Step 6: Validate plan structure
      await thoughts.thinking("validating task dependencies and critical path");
      this.validatePlan(plan);

      await thoughts.emit(
        "analyzing",
        `Plan validated: ${plan.tasks.length} tasks, ${plan.phases.length} phases`,
        {
          tasks: plan.tasks.length,
          phases: plan.phases.length,
          estimatedHours: plan.totalEstimatedHours,
        }
      );

      // Step 7: Store results in database
      await thoughts.accessing("database", "Storing execution plan");
      await this.storePlanningResults(input.projectId, plan, "blueprint", {
        blueprint: context.blueprint,
        techStack: context.techStack,
      }, rawThinking);

      // Step 8: Create AgentTask records for execution
      await thoughts.executing("creating agent task records for execution");
      await this.createAgentTasks(input.projectId, plan.tasks);

      // Step 9: Log execution
      const duration = Date.now() - startTime;
      await thoughts.executing("logging planning results");
      const executionId = await this.logExecution(input, plan, true, duration);

      await thoughts.completing(
        `Planning complete with ${plan.tasks.length} tasks (~${plan.totalEstimatedHours}h) in ${duration}ms`
      );

      logger.info(`[${this.name}] Legacy planning completed`, {
        projectId: input.projectId,
        taskCount: plan.tasks.length,
        phases: plan.phases.length,
        estimatedHours: plan.totalEstimatedHours,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        message: `Planning complete! Generated ${plan.tasks.length} tasks across ${plan.phases.length} phases.`,
        plan,
        executionId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const duration = Date.now() - startTime;

      await thoughts.error(errorMessage, {
        error: error instanceof Error ? error.stack : String(error),
      });

      logger.error(`[${this.name}] Legacy planning failed:`, toError(error));

      await this.logExecution(input, null, false, duration, errorMessage);

      return {
        success: false,
        message: `Planning failed: ${errorMessage}`,
      };
    }
  }

  // ==========================================
  // GPT-4o API HELPER (Primary for JSON generation)
  // ==========================================

  /**
   * Call Claude API with diagnostic logging
   */
  private async callClaude(
    prompt: string,
    thoughts?: ReturnType<typeof createThoughtStream>
  ): Promise<string> {
    const startTime = Date.now();
    const estimatedTokens = Math.ceil(prompt.length / 4);

    logger.info(`[${this.name}] Calling Claude API...`, {
      promptLength: prompt.length,
      estimatedTokens,
      model: AI_MODELS.CLAUDE,
    });

    try {
      // Ultra-simple, direct instruction
      const wrappedPrompt = `${prompt}

CRITICAL: Your response must be ONLY valid JSON. 
- Start immediately with {
- End with }
- No markdown blocks
- No explanations
- Just pure JSON

BEGIN:`;

      const systemPrompt = `You are a software architect. Output ONLY valid JSON. No markdown, no text, just JSON starting with { and ending with }.`;

      const response = await this.anthropic.messages.create({
        model: AI_MODELS.CLAUDE,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: wrappedPrompt,
          },
        ],
        max_tokens: 30000, // ← DOUBLED from 8192 to prevent truncation
        temperature: 0.1,
      });

      const duration = Date.now() - startTime;
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;

      if (thoughts) {
        await thoughts.emit(
          "executing",
          `Claude API completed in ${duration}ms`,
          { inputTokens, outputTokens }
        );
      }

      logger.info(`[${this.name}] Claude API completed in ${duration}ms`, {
        inputTokens,
        outputTokens,
      });

      const content =
        response.content[0]?.type === "text" ? response.content[0].text : "";

      if (!content) {
        throw new Error("No response from Claude");
      }

      logger.info(`[${this.name}] Response preview:`, {
        firstChars: content.substring(0, 100),
        lastChars: content.substring(Math.max(0, content.length - 100)),
        length: content.length,
        startsWithBrace: content.trim().startsWith("{"),
        endsWithBrace: content.trim().endsWith("}"),
      });

      return content;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${this.name}] Claude API call failed`, {
        duration: `${duration}ms`,
        error: toError(error),
      });

      if (error instanceof Error) {
        if (error.message.includes("timeout")) {
          throw new Error(
            "Claude API request timed out. Try simplifying your project requirements."
          );
        }
        if (error.message.includes("rate_limit")) {
          throw new Error(
            "Claude API rate limit exceeded. Please try again in a moment."
          );
        }
      }

      throw error;
    }
  }
  // ==========================================
  // VISION PLANNING HELPERS
  // ==========================================

  /**
   * Analyze vision text to extract intent, features, and goals
   */
  private async analyzeVision(
    visionText: string,
    thoughts?: ReturnType<typeof createThoughtStream>
  ): Promise<any> {
    if (thoughts) {
      await thoughts.thinking(
        "extracting project intent and core features from vision"
      );
    }

    const prompt = `
Analyze this project vision and extract key information:

VISION:
${visionText}

Extract and return JSON with:
{
  "projectType": "web app" | "mobile app" | "api" | "extension" | "desktop app",
  "coreFeatures": ["feature 1", "feature 2", ...],
  "targetAudience": "description",
  "keyFunctionality": ["function 1", "function 2", ...],
  "technicalNeeds": {
    "authentication": true/false,
    "database": true/false,
    "realtime": true/false,
    "payments": true/false,
    "fileUploads": true/false,
    "apiIntegrations": ["service1", "service2", ...]
  },
  "complexity": "simple" | "medium" | "complex"
}

IMPORTANT: Return ONLY the JSON object, with no markdown formatting, no code blocks, no explanations.
`;

    const responseText = await this.callClaude(prompt, thoughts);

    if (thoughts) {
      await thoughts.analyzing("vision analysis results");
    }

    return this.extractAndParseJSON(responseText);
  }

  /**
   * Extract technical requirements from vision analysis
   */
  private async extractRequirements(
    analysis: any,
    input: VisionPlanningInput
  ): Promise<any> {
    return {
      projectName: input.projectName,
      projectType: analysis.projectType,
      features: analysis.coreFeatures,
      functionality: analysis.keyFunctionality,
      technicalNeeds: analysis.technicalNeeds,
      complexity: analysis.complexity,
      userPreferences: input.techPreferences || {},
    };
  }

  /**
   * Design technical architecture based on requirements
   */
  private async designArchitecture(
    requirements: any,
    techPreferences?: any,
    thoughts?: ReturnType<typeof createThoughtStream>
  ): Promise<any> {
    // Smart architecture design based on project type and requirements
    const architecture: any = {
      frontend: techPreferences?.frontend || this.inferFrontend(requirements),
      backend: techPreferences?.backend || this.inferBackend(requirements),
      database: techPreferences?.database || this.inferDatabase(requirements),
      deployment:
        techPreferences?.deployment || this.inferDeployment(requirements),
    };

    if (thoughts) {
      await thoughts.emit("deciding", "Selected technical architecture", {
        frontend: architecture.frontend,
        backend: architecture.backend,
        database: architecture.database,
        deployment: architecture.deployment,
      });
    }

    return architecture;
  }

  private inferFrontend(requirements: any): string {
    if (requirements.projectType === "web app") return "Next.js";
    if (requirements.projectType === "mobile app") return "React Native";
    return "React";
  }

  private inferBackend(requirements: any): string {
    if (requirements.technicalNeeds.realtime) return "Node.js + Socket.io";
    return "Next.js API Routes";
  }

  private inferDatabase(requirements: any): string {
    if (requirements.complexity === "simple") return "None (static)";
    if (requirements.technicalNeeds.realtime) return "PostgreSQL + Redis";
    return "PostgreSQL";
  }

  private inferDeployment(requirements: any): string {
    if (this.inferFrontend(requirements).includes("Next.js")) return "Vercel";
    return "Railway";
  }

  /**
   * Build planning prompt for vision-based input
   */
  private buildVisionPlanningPrompt(
    input: VisionPlanningInput,
    analysis: any,
    architecture: any
  ): string {
    return `
You are a world-class software architect creating an execution plan from a project vision.

**PROJECT VISION:**
"${input.visionText}"

**PROJECT NAME:** ${input.projectName}

**VISION ANALYSIS:**
${JSON.stringify(analysis, null, 2)}

**RECOMMENDED ARCHITECTURE:**
${JSON.stringify(architecture, null, 2)}

**USER TECH PREFERENCES:**
${JSON.stringify(input.techPreferences || {}, null, 2)}

Create a detailed execution plan that brings this vision to life.

${this.getSharedPlanningInstructions()}

CRITICAL: Return ONLY the JSON object, with no markdown code blocks, no \`\`\`json tags, no explanations before or after. Just pure JSON.
`.trim();
  }

  // ==========================================
  // BLUEPRINT PLANNING HELPERS
  // ==========================================

  /**
   * Parse structured blueprint text
   */
  private async parseBlueprint(blueprint: string): Promise<any> {
    // Extract sections from markdown-style blueprint
    const sections: any = {};

    // Simple regex-based parsing
    const sectionRegex = /##\s+([^\n]+)\n([\s\S]*?)(?=##\s+|$)/g;
    let match;

    while ((match = sectionRegex.exec(blueprint)) !== null) {
      const title = match[1].trim();
      const content = match[2].trim();
      sections[title] = content;
    }

    return {
      raw: blueprint,
      sections,
      hasTechnicalSection: !!sections["Technical Approach"],
      hasGTMSection: !!sections["Go-To-Market Strategy"],
    };
  }

  /**
   * Enhance blueprint with sprint validation data
   */
  private async enhanceWithSprintData(
    parsed: any,
    sprintData: any
  ): Promise<any> {
    // Priority features based on completed validation tasks
    const validatedFeatures =
      sprintData.completedTasks
        ?.filter((t: any) => t.status === "completed")
        .map((t: any) => t.title) || [];

    return {
      ...parsed,
      priorityFeatures: validatedFeatures,
      validationResults: sprintData.validationResults,
      analytics: sprintData.analytics,
    };
  }

  /**
   * Build planning prompt for blueprint-based input
   */
  private buildBlueprintPlanningPrompt(
    blueprint: string,
    enhanced: any,
    sprintData?: any
  ): string {
    const sprintContext = sprintData
      ? `
**SPRINT VALIDATION DATA:**
Completed Tasks: ${enhanced.priorityFeatures?.join(", ") || "None"}
Validation Results: ${JSON.stringify(sprintData.validationResults || {}, null, 2)}

**PRIORITY GUIDANCE:**
Features validated in the sprint should be prioritized in Wave 1-2.
Unvalidated features can be deprioritized to later waves.
`
      : "";

    return `
You are a world-class software architect creating an execution plan from a validated blueprint.

**PROJECT BLUEPRINT:**
${blueprint}

${sprintContext}

Create a detailed execution plan that implements this blueprint.

${this.getSharedPlanningInstructions()}

CRITICAL: Return ONLY the JSON object, with no markdown code blocks, no \`\`\`json tags, no explanations before or after. Just pure JSON.
`.trim();
  }

  /**
   * Build legacy planning prompt (from existing context)
   */
  private buildLegacyPlanningPrompt(context: any): string {
    return `
You are a world-class software architect and technical planner. Create a comprehensive execution plan for this project.

PROJECT BLUEPRINT:
${JSON.stringify(context.blueprint, null, 2)}

RECOMMENDED TECH STACK:
${JSON.stringify(context.techStack, null, 2)}

VALIDATION RESULTS:
${JSON.stringify(context.validation, null, 2)}

${this.getSharedPlanningInstructions()}

CRITICAL: Return ONLY the JSON object, with no markdown code blocks, no \`\`\`json tags, no explanations before or after. Just pure JSON.
`.trim();
  }

  // ==========================================
  // SHARED HELPERS (used by all modes)
  // ==========================================

  /**
   * Get shared planning instructions for AI prompts
   */
  private getSharedPlanningInstructions(): string {
    return `
**CRITICAL - ATOMIC TASKS ONLY**: Each task MUST be truly atomic:
   - ✅ Simple: 2 file, 2 endpoint, OR 2-3 component (200-350 lines max)
   - ⚠️ Medium: 4-6 tightly related files (300-550 lines total)
   - ❌ Complex: NEVER create tasks >600 lines - split them further!

   // ⬇️⬇️ ADD THIS NEW BLOCK ⬇️⬇️
**CRITICAL - COMPREHENSIVENESS**:
1.  **COVER ALL FEATURES**: You MUST generate tasks for EVERY user-requested feature. Do not skip any.
2.  **PLAN THE FULL APP, NOT JUST SETUP**: Do not *only* plan setup tasks (like user models, project setup, and DB setup). You must also plan the entire core application logic.
3.  **EXAMPLE OF A BAD, INCOMPLETE PLAN (DO NOT DO THIS):**
    * **User Request:** "Create a real-time multiplayer trivia game with rooms, questions, and a live leaderboard."
    * **Bad Plan:** 1. Setup Vite, 2. Create User model, 3. Create /api/users, 4. Setup Socket.io, 5. Create GameRoom model, 6. Create GameRoom component, 7. Implement "join room" event.
    * **Why it's BAD:** This plan completely misses the game! It has no questions, no game logic, no answer handling, and no leaderboard.
4.  **EXAMPLE OF A GOOD, COMPLETE PLAN (DO THIS):**
    * **Good Plan:** 1. Setup Vite, 2. Create User model, ... 5. Create GameRoom model, **6. Create Question model (with categories, answers)**, ... **8. Implement "start game" logic**, **9. Implement "send question" Socket.io event**, **10. Implement "submit answer" Socket.io event**, **11. Implement "update leaderboard" Socket.io event**, **12. Create GameRound component**, **13. Create Leaderboard component**, etc.
// ⬆️⬆️ END OF NEW BLOCK ⬆️⬆️



**Task Granularity Examples:**
   ✅ GOOD: "Create User model in Prisma schema"
   ✅ GOOD: "Implement POST /api/users endpoint"
   ✅ GOOD: "Create UserCard component with props"
   ❌ BAD: "Build entire authentication system"
   ❌ BAD: "Create all user management features"
   ❌ BAD: "Implement frontend and backend for users"

**Complexity Guidelines:**
   - Simple (1-3 hours): Single file, clear scope, no external dependencies
   - Medium (3-6 hours): 2-3 files, moderate integration
   - Complex: SPLIT INTO SMALLER TASKS!

**REQUIREMENTS:**
1. Break features into ATOMIC tasks (each task = 1-6 hours max, preferably 1-3)
2. Create proper dependencies (no circular dependencies)
3. Organize tasks into logical phases (Foundation, Core Features, Integration, Polish)
4. Be specific about files, endpoints, and components
5. Include clear acceptance criteria for each task
6. Prioritize tasks: 1 (must do first) to 5 (nice to have)
7. Identify the critical path
8. Include estimated lines of code for each task

**CATEGORIES:**
- frontend: UI components, pages, layouts
- backend: API routes, server logic, business logic
- database: Schema, migrations, queries
- devops: Deployment, CI/CD, infrastructure
- integration: Third-party APIs, external services
- testing: Unit tests, integration tests, E2E tests

**OUTPUT FORMAT (JSON only):**
{
  "architecture": {
    "projectStructure": {
      "directories": ["src/", "public/", etc.],
      "rootFiles": ["package.json", ".env.example", etc.]
    },
    "frontendArchitecture": {
      "framework": "Next.js 14",
      "stateManagement": "React Context / Zustand",
      "routing": "App Router",
      "styling": "Tailwind CSS",
      "keyComponents": ["Header", "Dashboard", etc.]
    },
    "backendArchitecture": {
      "framework": "Next.js API Routes",
      "apiPattern": "REST",
      "authentication": "NextAuth.js",
      "keyEndpoints": ["/api/users", "/api/projects", etc.]
    },
    "databaseArchitecture": {
      "type": "PostgreSQL",
      "orm": "Prisma",
      "keyModels": ["User", "Project", etc.],
      "relationships": ["User -> Projects (1:n)", etc.]
    },
    "infrastructureArchitecture": {
      "hosting": "Vercel | Railway | Render | etc.",
      "cicd": "GitHub Actions",
      "monitoring": "Vercel Analytics | Sentry",
      "scaling": "Serverless auto-scaling"
    }
  },
  "tasks": [
    {
      "id": "task-001",
      "title": "Task title",
      "description": "Detailed description",
      "category": "frontend | backend | database | devops | integration | testing",
      "priority": 1,
      "estimatedHours": 2,
      "estimatedLines": 150,
      "complexity": "simple | medium",
      "dependencies": ["task-000"],
      "technicalDetails": {
        "files": ["path/to/file.ts"],
        "technologies": ["Next.js", "TypeScript"],
        "endpoints": ["/api/example"],
        "components": ["ComponentName"]
      },
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ]
    }
  ],
  "phases": [
    {
      "name": "Phase 1: Foundation",
      "taskIds": ["task-001", "task-002"],
      "estimatedDuration": "1 week"
    }
  ],
  "totalEstimatedHours": 120,
  "criticalPath": ["task-001", "task-002", "task-010"]
}
`.trim();
  }

  /**
   * Robust JSON extraction and parsing from AI responses
   */
  /**
   * Robust JSON extraction and parsing from AI responses
   * Handles Claude responses with thinking text, markdown, or explanations
   */
  /**
   * Extract and parse JSON with comprehensive diagnostics
   */
  private extractAndParseJSON(responseText: string): any {
    logger.info(`[${this.name}] Extracting JSON from Claude response`);

    try {
      // STRATEGY 1: Remove markdown blocks if present
      let jsonText = responseText.trim();

      // Check for markdown code blocks and strip them
      const markdownMatch = jsonText.match(
        /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/
      );
      if (markdownMatch && markdownMatch[1]) {
        jsonText = markdownMatch[1].trim();
        logger.info(`[${this.name}] Stripped markdown code blocks`);
      }

      // STRATEGY 2: Try direct parse
      if (jsonText.startsWith("{") && jsonText.endsWith("}")) {
        try {
          const parsed = JSON.parse(jsonText);
          logger.info(`[${this.name}] ✅ Direct parse succeeded`);
          return parsed;
        } catch (e) {
          logger.warn(`[${this.name}] Direct parse failed, trying extraction`);
        }
      }

      // STRATEGY 3: Brace matching (handles incomplete responses)
      let braceCount = 0;
      let jsonStart = -1;
      let jsonEnd = -1;

      for (let i = 0; i < jsonText.length; i++) {
        const char = jsonText[i];

        if (char === "{") {
          if (braceCount === 0) {
            jsonStart = i;
          }
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0 && jsonStart !== -1) {
            jsonEnd = i;
            break; // Found complete JSON
          }
        }
      }

      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonString = jsonText.substring(jsonStart, jsonEnd + 1);
        try {
          const parsed = JSON.parse(jsonString);
          logger.info(`[${this.name}] ✅ Brace matching succeeded`);
          return parsed;
        } catch (e) {
          logger.error(
            `[${this.name}] Brace matching parse failed:`,
            toError(e).message
          );
        }
      }

      // STRATEGY 4: Last resort - indexOf
      const simpleStart = jsonText.indexOf("{");
      const simpleEnd = jsonText.lastIndexOf("}");

      if (simpleStart !== -1 && simpleEnd !== -1 && simpleEnd > simpleStart) {
        try {
          const jsonString = jsonText.substring(simpleStart, simpleEnd + 1);
          const parsed = JSON.parse(jsonString);
          logger.info(`[${this.name}] ✅ indexOf method succeeded`);
          return parsed;
        } catch (e) {
          logger.error(
            `[${this.name}] indexOf parse failed:`,
            toError(e).message
          );
        }
      }

      // ALL FAILED
      logger.error(`[${this.name}] All parsing strategies failed`, {
        length: jsonText.length,
        preview: jsonText.substring(0, 300),
        hasOpenBrace: jsonText.includes("{"),
        hasCloseBrace: jsonText.includes("}"),
      });

      throw new Error(
        `Failed to parse planning response. AI returned invalid format. ` +
          `Length: ${jsonText.length}. ` +
          `Preview: ${jsonText.substring(0, 300)}...`
      );
    } catch (error) {
      logger.error(
        `[${this.name}] Critical parsing error:`,
        toError(error).message
      );

      throw new Error(
        `Failed to parse planning response. AI returned invalid format. ` +
          `Error: ${toError(error).message}`
      );
    }
  }

  /**
   * Parse AI response into structured execution plan
   */
  private parsePlanningResponse(responseText: string): ExecutionPlan {
    try {
      const parsed = this.extractAndParseJSON(responseText);

      if (
        !parsed.architecture ||
        !parsed.tasks ||
        !Array.isArray(parsed.tasks)
      ) {
        logger.error(`[${this.name}] Invalid structure:`, {
          hasArchitecture: !!parsed.architecture,
          hasTasks: !!parsed.tasks,
          tasksIsArray: Array.isArray(parsed.tasks),
          keys: Object.keys(parsed),
        });

        throw new Error(
          "Invalid planning response format - missing required fields"
        );
      }

      return parsed as ExecutionPlan;
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to parse AI response`,
        toError(error)
      );
      throw new Error(
        "Failed to parse planning response. AI returned invalid format."
      );
    }
  }

  /**
   * Validate plan structure
   */
  private validatePlan(plan: ExecutionPlan): void {
    const taskIds = new Set(plan.tasks.map((t) => t.id));

    for (const task of plan.tasks) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          throw new Error(`Task ${task.id} has invalid dependency: ${depId}`);
        }
      }
    }

    logger.info(`[${this.name}] Plan validation passed`);
  }

  /**
   * Store planning results in database
   */
  private async storePlanningResults(
    projectId: string,
    plan: ExecutionPlan,
    sourceType: "vision" | "blueprint",
    metadata: any,
    rawThinking?: string
  ): Promise<void> {
    // Store the source type and metadata in the plan itself for reference
    const planWithMetadata = {
      ...plan,
      metadata: { 
        sourceType, 
        ...metadata,
        ...(rawThinking ? { extendedThinking: rawThinking } : {}),
      },
    };

    // Check if this is the first time storing a plan
    const existingContext = await prisma.projectContext.findUnique({
      where: { projectId },
      select: { originalPlan: true, executionPlan: true },
    });

    await prisma.projectContext.upsert({
      where: { projectId },
      create: {
        projectId,
        userId: metadata.userId || "",
        conversationId: metadata.conversationId || `${sourceType}_${projectId}`,
        executionPlan: planWithMetadata as any,
        originalPlan: planWithMetadata as any, // Store as original plan
        currentPhase: "plan_review", // Set to plan_review instead of execution
        updatedAt: new Date(),
      },
      update: {
        executionPlan: planWithMetadata as any,
        // Only update originalPlan if it doesn't exist yet
        ...(existingContext?.originalPlan
          ? {}
          : { originalPlan: planWithMetadata as any }),
        currentPhase: "plan_review",
        updatedAt: new Date(),
      },
    });

    logger.info(`[${this.name}] Stored execution plan in ProjectContext`, {
      projectId,
      sourceType,
    });
  }

  /**
   * Create AgentTask records for execution agents
   */
  private async createAgentTasks(
    projectId: string,
    tasks: AtomicTask[]
  ): Promise<void> {
    const agentTasks = tasks.map((task) => ({
      projectId,
      agentName: this.determineAgentForTask(task.category),
      status: "pending",
      priority: task.priority,
      input: {
        ...task,
        metadata: {
          complexity: task.complexity,
          estimatedLines: task.estimatedLines,
          estimatedHours: task.estimatedHours,
        },
      } as any,
    }));

    await prisma.agentTask.createMany({
      data: agentTasks,
    });

    logger.info(
      `[${this.name}] Created ${agentTasks.length} AgentTask records`
    );
  }

  /**
   * Determine which execution agent should handle a task
   */
  private determineAgentForTask(category: string): string {
    const agentMap: Record<string, string> = {
      frontend: "FrontendAgent",
      backend: "BackendAgent",
      database: "DatabaseAgent",
      devops: "DevOpsAgent",
      integration: "IntegrationAgent",
      testing: "TestingAgent",
    };

    return agentMap[category] || "GeneralAgent";
  }

  /**
   * Log execution to AgentExecution table
   */
  private async logExecution(
    input: PlanningInput | LegacyPlanningInput,
    plan: ExecutionPlan | null,
    success: boolean,
    durationMs: number,
    error?: string
  ): Promise<string> {
    const execution = await prisma.agentExecution.create({
      data: {
        projectId: input.projectId,
        agentName: this.name,
        phase: this.phase,
        input: input as any,
        output: plan as any,
        success,
        durationMs,
        error,
      },
    });

    return execution.id;
  }

  /**
   * Get project context from database (legacy support)
   */
  private async getProjectContext(projectId: string) {
    const context = await prisma.projectContext.findUnique({
      where: { projectId },
    });

    if (!context) {
      return null;
    }

    const architecture = context.architecture as any;
    const validation = architecture?.validation;

    return {
      blueprint: context.blueprint,
      techStack: context.techStack,
      validation: validation,
    };
  }

  /**
   * Analyze user feedback on a plan without applying changes
   */
  async analyzeFeedback(
    projectId: string,
    feedback: {
      freeformFeedback?: string;
      structuredChanges?: {
        taskModifications?: Array<{
          taskId: string;
          action: "modify" | "remove" | "add";
          changes?: Record<string, any>;
        }>;
        priorityChanges?: Array<{
          taskId: string;
          newPriority: number;
        }>;
        techStackChanges?: Record<string, any>;
      };
    }
  ): Promise<{
    feasible: boolean;
    warnings: string[];
    blockers: string[];
    suggestedChanges: any[];
  }> {
    try {
      logger.info(`[${this.name}] Analyzing feedback`, { projectId });

      const context = await prisma.projectContext.findUnique({
        where: { projectId },
      });

      if (!context || !context.executionPlan) {
        return {
          feasible: false,
          warnings: [],
          blockers: ["No existing plan found"],
          suggestedChanges: [],
        };
      }

      const currentPlan = context.executionPlan as any;

      const prompt = `
You are a software architect analyzing user feedback on an execution plan.

CURRENT PLAN:
${JSON.stringify(currentPlan, null, 2)}

USER FEEDBACK:
${feedback.freeformFeedback || "No freeform feedback"}

STRUCTURED CHANGES:
${JSON.stringify(feedback.structuredChanges || {}, null, 2)}

Analyze the feasibility of these changes and identify:
1. Any warnings or concerns
2. Any blocking issues that prevent implementation
3. Suggested modifications to make the changes work better

Return ONLY a valid JSON object with this structure (no markdown, no code blocks):
{
  "feasible": true/false,
  "warnings": ["warning1", "warning2"],
  "blockers": ["blocker1"],
  "suggestedChanges": [
    { "type": "modify", "taskId": "task1", "suggestion": "..." }
  ]
}
`;

      const responseText = await this.callClaude(prompt);
      const analysis = this.extractAndParseJSON(responseText);

      logger.info(`[${this.name}] Feedback analysis complete`, {
        projectId,
        feasible: analysis.feasible,
      });

      return analysis;
    } catch (error) {
      logger.error(`[${this.name}] Failed to analyze feedback`, toError(error));
      return {
        feasible: false,
        warnings: ["Failed to analyze feedback"],
        blockers: [toError(error).message],
        suggestedChanges: [],
      };
    }
  }

  /**
   * Apply user feedback to an existing plan
   */
  async applyFeedback(
    projectId: string,
    feedback: string,
    analysisResult?: any
  ): Promise<{
    success: boolean;
    message: string;
    plan?: ExecutionPlan;
  }> {
    try {
      logger.info(`[${this.name}] Applying feedback to plan`, { projectId });

      const context = await prisma.projectContext.findUnique({
        where: { projectId },
      });

      if (!context || !context.executionPlan) {
        return {
          success: false,
          message: "No existing plan found",
        };
      }

      const currentPlan = context.executionPlan as any;
      const currentRevisionCount = context.planRevisionCount || 0;

      const prompt = `
You are a software architect updating an execution plan based on user feedback.

CURRENT PLAN:
${JSON.stringify(currentPlan, null, 2)}

USER FEEDBACK:
${feedback}

${analysisResult ? `ANALYSIS RESULT:\n${JSON.stringify(analysisResult, null, 2)}` : ""}

Please provide an updated execution plan that addresses the user's feedback.
IMPORTANT: Do NOT regenerate the entire plan from scratch. Instead:
1. Keep all existing tasks and phases that are not affected by the feedback
2. Only modify, add, or remove tasks/features as specifically requested in the feedback
3. Maintain the existing task IDs and structure where possible
4. Update dependencies if tasks are modified

Return ONLY a valid JSON object (no markdown, no code blocks) with the complete plan structure.
`;

      const responseText = await this.callClaude(prompt);
      const updatedPlan = this.extractAndParseJSON(responseText);

      // Add metadata to track revision
      const updatedPlanWithMetadata = {
        ...updatedPlan,
        metadata: {
          ...updatedPlan.metadata,
          revisionCount: currentRevisionCount + 1,
          lastFeedback: feedback,
          lastUpdated: new Date().toISOString(),
        },
      };

      await prisma.projectContext.update({
        where: { projectId },
        data: {
          executionPlan: updatedPlanWithMetadata,
          planRevisionCount: currentRevisionCount + 1,
          planFeedback: {
            feedback,
            analysisResult,
            appliedAt: new Date().toISOString(),
          } as any,
          updatedAt: new Date(),
        },
      });

      logger.info(`[${this.name}] Plan updated with feedback`, {
        projectId,
        revisionCount: currentRevisionCount + 1,
      });

      return {
        success: true,
        message: "Plan updated successfully based on feedback",
        plan: updatedPlanWithMetadata,
      };
    } catch (error) {
      logger.error(`[${this.name}] Failed to apply feedback`, toError(error));
      return {
        success: false,
        message: `Failed to apply feedback: ${toError(error).message}`,
      };
    }
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.callClaude("Test health check");
      return true;
    } catch {
      return false;
    }
  }
}

// ==========================================
// EXPORT SINGLETON INSTANCE
// ==========================================

export const planningAgent = new PlanningAgent();
