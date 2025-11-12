// lib/agents/planning/planning-agent-enhanced.ts
/**
 * Enhanced Planning Agent with Hybrid Transparency
 * Combines:
 * 1. Curated thoughts - Clean, user-friendly
 * 2. Extended thinking - Claude's raw reasoning
 * 3. Chain-of-thought - Step-by-step explanations
 * 4. Deep dive mode - Optional raw AI reasoning
 */

import Anthropic from "@anthropic-ai/sdk";
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

// Import types from original planning agent
import type {
  PlanningInput,
  PlanningOutput,
  ExecutionPlan,
  AtomicTask,
} from "./planning-agent";

export interface EnhancedPlanningOptions {
  enableDeepDive?: boolean; // Show raw AI reasoning
  useExtendedThinking?: boolean; // Use Claude's thinking feature
  useChainOfThought?: boolean; // Force step-by-step reasoning
}

export class EnhancedPlanningAgent {
  private anthropic: Anthropic;
  public readonly name = "PlanningAgent";
  public readonly phase = "planning";

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY required for PlanningAgent");
    }

    this.anthropic = new Anthropic({
      apiKey,
      timeout: 30 * 60 * 1000,
      maxRetries: 2,
    });
  }

  /**
   * Execute planning with hybrid transparency
   */
  async execute(
    input: PlanningInput,
    options: EnhancedPlanningOptions = {}
  ): Promise<PlanningOutput> {
    const startTime = Date.now();

    const {
      enableDeepDive = false,
      useExtendedThinking = true, // ✅ Default ON for important decisions
      useChainOfThought = false,
    } = options;

    // ✅ Create thought stream with deep dive mode
    const thoughts = createThoughtStream(
      input.projectId,
      this.name,
      enableDeepDive
    );

    try {
      await thoughts.starting("blueprint-based execution planning");

      // Layer 1: Curated thoughts (always on)
      await thoughts.accessing(
        "ProjectContext database",
        "Retrieving project data"
      );
      const context = await this.getProjectContext(input.projectId);

      if (!context) {
        await thoughts.error("Project context not found");
        throw new Error(
          "Project context not found. Run previous agents first."
        );
      }

      await thoughts.analyzing("validation results and feasibility");

      if (!context.validation || !context.validation.feasible) {
        await thoughts.error("Project not feasible");
        throw new Error("Project not feasible. Address blockers first.");
      }

      await thoughts.deciding("Project is feasible - proceeding with planning");

      // Build base prompt
      const basePrompt = this.buildPlanningPrompt(context);

      let responseText: string;
      let rawThinking: string | undefined;

      // Layer 2 & 3: Extended Thinking OR Chain-of-Thought
      if (useExtendedThinking) {
        await thoughts.thinking("Using extended thinking for deep analysis");

        // ✅ Use Claude's Extended Thinking (real AI reasoning)
        const result = await executeWithExtendedThinking({
          thoughts,
          prompt: basePrompt,
          thinkingBudget: 10000, // 10k tokens for deep thinking
          parseSteps: true, // Break into individual thoughts
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

        // ✅ Chain-of-Thought prompting
        const cotPrompt = buildChainOfThoughtPrompt(basePrompt);

        await thoughts.accessing(
          "Claude AI",
          "Requesting step-by-step reasoning"
        );
        const response = await this.anthropic.messages.create({
          model: AI_MODELS.CLAUDE,
          messages: [{ role: "user", content: cotPrompt }],
          max_tokens: 16000,
          temperature: 0.1,
        });

        const fullResponse =
          response.content[0]?.type === "text" ? response.content[0].text : "";

        // Parse and emit chain-of-thought steps
        responseText = await parseChainOfThought(fullResponse, thoughts);
      } else {
        // Standard execution (curated thoughts only)
        await thoughts.accessing(
          "Claude AI",
          "Generating atomic tasks and phases"
        );

        const response = await this.anthropic.messages.create({
          model: AI_MODELS.CLAUDE,
          messages: [{ role: "user", content: basePrompt }],
          max_tokens: 16000,
          temperature: 0.1,
        });

        responseText =
          response.content[0]?.type === "text" ? response.content[0].text : "";
      }

      // Parse and validate plan
      await thoughts.analyzing("AI response and extracting plan structure");
      const plan = this.parsePlanningResponse(responseText);

      await thoughts.thinking("validating task dependencies and critical path");
      this.validatePlan(plan);

      await thoughts.emit(
        "analyzing",
        `Plan validated: ${plan.tasks.length} tasks`,
        {
          tasks: plan.tasks.length,
          phases: plan.phases.length,
          estimatedHours: plan.totalEstimatedHours,
        }
      );

      // Store results
      await thoughts.accessing("database", "Storing execution plan");
      await this.storePlanningResults(input.projectId, plan, rawThinking);

      await thoughts.executing("creating agent task records for execution");
      await this.createAgentTasks(input.projectId, plan.tasks);

      const duration = Date.now() - startTime;
      await thoughts.executing("logging planning results");
      const executionId = await this.logExecution(input, plan, true, duration);

      await thoughts.completing(
        `Planning complete with ${plan.tasks.length} tasks in ${duration}ms`
      );

      logger.info(`[${this.name}] Planning completed`, {
        projectId: input.projectId,
        taskCount: plan.tasks.length,
        phases: plan.phases.length,
        usedExtendedThinking: useExtendedThinking,
        usedChainOfThought: useChainOfThought,
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

      logger.error(`[${this.name}] Planning failed:`, toError(error));
      await this.logExecution(input, null, false, duration, errorMessage);

      return {
        success: false,
        message: `Planning failed: ${errorMessage}`,
      };
    }
  }

  // ==========================================
  // HELPER METHODS (same as original agent)
  // ==========================================

  private async getProjectContext(projectId: string) {
    const context = await prisma.projectContext.findUnique({
      where: { projectId },
    });

    if (!context) return null;

    const architecture = context.architecture as any;
    const validation = architecture?.validation;
    const blueprint = context.blueprint as any;
    const rawBlueprint = blueprint?.raw || blueprint;

    return {
      blueprint: rawBlueprint,
      techStack: context.techStack,
      validation: validation,
    };
  }

  private buildPlanningPrompt(context: any): string {
    return `
You are a world-class software architect creating an execution plan from a validated blueprint.

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

  private parsePlanningResponse(responseText: string): ExecutionPlan {
    // Same parsing logic as original
    const cleanedText = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let jsonStart = cleanedText.indexOf("{");
    let jsonEnd = cleanedText.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No valid JSON found in response");
    }

    const jsonString = cleanedText.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString);

    if (!parsed.architecture || !parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error("Invalid planning response format");
    }

    return parsed as ExecutionPlan;
  }

  private validatePlan(plan: ExecutionPlan): void {
    const taskIds = new Set(plan.tasks.map((t) => t.id));

    for (const task of plan.tasks) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          throw new Error(`Task ${task.id} has invalid dependency: ${depId}`);
        }
      }
    }
  }

  private async storePlanningResults(
    projectId: string,
    plan: ExecutionPlan,
    rawThinking?: string
  ): Promise<void> {
    const planWithMetadata = {
      ...plan,
      metadata: {
        sourceType: "blueprint",
        hasExtendedThinking: !!rawThinking,
        extendedThinkingLength: rawThinking?.length || 0,
      },
    };

    await prisma.projectContext.update({
      where: { projectId },
      data: {
        executionPlan: planWithMetadata as any,
        currentPhase: "plan_review",
        updatedAt: new Date(),
      },
    });
  }

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
  }

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

  private async logExecution(
    input: PlanningInput,
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
}

export const enhancedPlanningAgent = new EnhancedPlanningAgent();
