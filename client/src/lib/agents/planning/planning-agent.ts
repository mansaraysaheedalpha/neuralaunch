// src/lib/agents/planning/planning-agent.ts
/**
 * Planning Agent (Architect Agent)
 * Creates technical architecture and breaks features into atomic executable tasks
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AI_MODELS } from "@/lib/models";
import { z } from "zod";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface PlanningInput {
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
  priority: number; // 1 (highest) to 5 (lowest)
  estimatedHours: number;
  estimatedLines: number; // NEW: Estimated lines of code
  complexity: "simple" | "medium"; // NEW: Only simple or medium allowed!
  dependencies: string[]; // Array of task IDs that must complete first
  technicalDetails: {
    files: string[]; // Files to create/modify
    technologies: string[]; // Technologies to use
    endpoints?: string[]; // API endpoints if applicable
    components?: string[]; // React components if applicable
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
    apiPattern: string; // REST, GraphQL, tRPC, etc.
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

export interface TaskComplexityAnalysis {
  isAtomic: boolean;
  complexity: "simple" | "medium" | "complex";
  estimatedLines: number;
  shouldSplit: boolean;
  reason?: string;
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
  criticalPath: string[]; // Task IDs in critical path
}

export interface PlanningOutput {
  success: boolean;
  message: string;
  plan?: ExecutionPlan;
  executionId?: string;
}

// ==========================================
// PLANNING AGENT CLASS
// ==========================================

export class PlanningAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;
  public readonly name = "PlanningAgent";
  public readonly phase = "planning";

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is required for PlanningAgent");
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: AI_MODELS.PRIMARY,
      generationConfig: {
        temperature: 0.4, // Balanced for creative yet structured planning
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
    });
  }

  /**
   * Main execution method
   */
  async execute(input: PlanningInput): Promise<PlanningOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting planning for project ${input.projectId}`
    );

    try {
      // Step 1: Get project context (blueprint, tech stack, validation)
      const context = await this.getProjectContext(input.projectId);

      if (!context) {
        throw new Error(
          "Project context not found. Run previous agents first."
        );
      }

      if (!context.validation) {
        throw new Error(
          "Validation results not found. Run Validation Agent first."
        );
      }

      // Step 2: Check if project is feasible
      if (!context.validation.feasible) {
        throw new Error(
          "Project is not feasible according to validation. Address blockers first."
        );
      }

      // Step 3: Generate planning prompt
      const prompt = this.buildPlanningPrompt(context);

      // Step 4: Get AI planning analysis
      logger.info(`[${this.name}] Requesting AI planning analysis...`);
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      // Step 5: Parse AI response
      const plan = this.parsePlanningResponse(responseText);

      // Step 6: Validate task atomicity
      const atomicityCheck = this.validateTaskAtomicity(plan.tasks);

      if (!atomicityCheck.valid) {
        logger.warn(`[${this.name}] Task atomicity issues found`, {
          issues: atomicityCheck.issues,
          suggestions: atomicityCheck.suggestions,
        });

        // Log issues but don't fail - we'll improve this iteratively
        logger.warn(`[${this.name}] Proceeding despite atomicity warnings`);
      }

      // Log statistics
      logger.info(`[${this.name}] Task complexity breakdown`, {
        simple: plan.tasks.filter((t) => t.complexity === "simple").length,
        medium: plan.tasks.filter((t) => t.complexity === "medium").length,
        avgHours: (
          plan.tasks.reduce((sum, t) => sum + t.estimatedHours, 0) /
          plan.tasks.length
        ).toFixed(1),
        avgLines: (
          plan.tasks.reduce((sum, t) => sum + t.estimatedLines, 0) /
          plan.tasks.length
        ).toFixed(0),
      });
      // Step 6: Validate plan structure
      this.validatePlan(plan);

      // Step 7: Store results in database
      await this.storePlanningResults(input.projectId, plan);

      // Step 8: Create AgentTask records for execution
      await this.createAgentTasks(input.projectId, plan.tasks);

      // Step 9: Log execution
      const duration = Date.now() - startTime;
      const executionId = await this.logExecution(input, plan, true, duration);

      logger.info(`[${this.name}] Planning completed`, {
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

      logger.error(`[${this.name}] Planning failed:`, error);

      await this.logExecution(input, null, false, duration, errorMessage);

      return {
        success: false,
        message: `Planning failed: ${errorMessage}`,
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

    const architecture = context.architecture as any;
    const validation = architecture?.validation;

    return {
      blueprint: context.blueprint,
      techStack: context.techStack,
      validation: validation,
    };
  }

  /**
   * Build planning prompt for AI
   */
  private buildPlanningPrompt(context: any): string {
    return `
You are a world-class software architect and technical planner. Create a comprehensive execution plan for this project.

PROJECT BLUEPRINT:
${JSON.stringify(context.blueprint, null, 2)}

RECOMMENDED TECH STACK:
${JSON.stringify(context.techStack, null, 2)}

VALIDATION RESULTS:
${JSON.stringify(context.validation, null, 2)}

**INFRASTRUCTURE TASK RULES:**

Only create infrastructure tasks that are ACTUALLY NEEDED for this specific project:

✅ **CREATE infrastructure tasks if:**
- Project needs containerization → "Create Dockerfile for [runtime]"
- Project needs deployment config → "Configure [deployment platform] settings"
- Project uses database migrations → "Setup [ORM] migration structure"
- Project needs CI/CD → "Configure GitHub Actions for [language]"
- Project needs environment variables → "Create .env.example with [specific vars]"

❌ **DON'T CREATE infrastructure tasks if:**
- Vercel/Netlify project (they handle deployment automatically)
- No containerization needed (serverless, static sites)
- Project doesn't use databases
- Simple projects without CI/CD requirements

**EXAMPLE INFRASTRUCTURE TASKS:**

For Node.js API with PostgreSQL + Docker:
{
  "id": "task-infra-001",
  "title": "Create Dockerfile for Node.js API",
  "description": "Multi-stage Docker build for production deployment",
  "category": "infrastructure",
  "priority": 1,
  "estimatedHours": 1,
  "estimatedLines": 50,
  "complexity": "simple",
  "dependencies": [],
  "technicalDetails": {
    "files": ["Dockerfile", ".dockerignore"],
    "technologies": ["Docker", "Node.js 20"],
  },
  "acceptanceCriteria": [
    "Multi-stage build (builder + runner)",
    "Non-root user for security",
    "Health check included"
  ]
}

{
  "id": "task-infra-002",
  "title": "Setup Prisma migrations structure",
  "description": "Initialize Prisma migration folder and seed script",
  "category": "infrastructure",
  "priority": 1,
  "estimatedHours": 1,
  "estimatedLines": 100,
  "complexity": "simple",
  "dependencies": [],
  "technicalDetails": {
    "files": ["prisma/migrations/.gitkeep", "prisma/seed.ts"],
    "technologies": ["Prisma"],
  },
  "acceptanceCriteria": [
    "Migration folder structure created",
    "Seed script template created"
  ]
}

For Next.js on Vercel (NO DOCKER NEEDED):
{
  "id": "task-infra-001",
  "title": "Create environment variable template",
  "description": "Setup .env.example with Next.js environment variables",
  "category": "infrastructure",
  "priority": 1,
  "estimatedHours": 0.5,
  "estimatedLines": 30,
  "complexity": "simple",
  "dependencies": [],
  "technicalDetails": {
    "files": [".env.example", ".env.local.example"],
    "technologies": ["Next.js"],
  },
  "acceptanceCriteria": [
    "All required environment variables documented",
    "Public vs private variables separated"
  ]
}

Generate tasks based on ACTUAL PROJECT NEEDS, not assumptions!

Create a detailed execution plan with the following JSON structure:

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
      "hosting": "Vercel",
      "cicd": "GitHub Actions",
      "monitoring": "Vercel Analytics",
      "scaling": "Serverless auto-scaling"
    }
  },
  "tasks": [
    {
      "id": "task-001",
      "title": "Project Setup and Configuration",
      "description": "Initialize Next.js project with TypeScript, configure Tailwind CSS, set up ESLint and Prettier",
      "category": "devops",
      "priority": 1,
      "estimatedHours": 2,
      "dependencies": [],
      "technicalDetails": {
        "files": ["package.json", "tsconfig.json", "tailwind.config.js"],
        "technologies": ["Next.js 14", "TypeScript", "Tailwind CSS"],
        "endpoints": [],
        "components": []
      },
      "acceptanceCriteria": [
        "Next.js 14 with App Router initialized",
        "TypeScript configured with strict mode",
        "Tailwind CSS working with custom config",
        "Dev server runs without errors"
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

**DEPLOYMENT PLATFORM SELECTION RULES:**

Choose the BEST deployment platform based on project characteristics:

✅ **Vercel** - Use when:
- Next.js (App Router or Pages Router)
- React/Vue/Angular static sites
- Serverless functions
- Needs edge computing
- Fast global CDN required
Example: "Next.js blog", "E-commerce storefront", "SaaS dashboard"

✅ **Railway** - Use when:
- Node.js/Python/Go backend APIs
- Needs PostgreSQL/MySQL/Redis
- Long-running processes
- WebSocket support
- Full server control needed
Example: "Express API with PostgreSQL", "FastAPI backend", "Real-time chat API"

✅ **Render** - Use when:
- Full-stack apps with database
- Background workers/cron jobs
- Docker-based deployment
- Static sites with API
- Similar to Railway but different pricing
Example: "Django app", "Ruby on Rails", "Microservices"

✅ **Fly.io** - Use when:
- Global edge deployment needed
- Multi-region applications
- Low-latency requirements
- Docker containers
Example: "Global API", "Multi-region database", "Edge computing apps"

✅ **AWS (Amplify/ECS/Lambda)** - Use when:
- Enterprise requirements
- Complex infrastructure
- Existing AWS ecosystem
- Custom scaling needs
Example: "Enterprise SaaS", "Complex microservices", "Data-intensive apps"

✅ **Netlify** - Use when:
- Static sites (no backend)
- Jamstack applications
- Serverless functions (simple)
- CI/CD for static content
Example: "Documentation sites", "Marketing pages", "Gatsby/Hugo sites"

✅ **DigitalOcean App Platform** - Use when:
- Simple full-stack apps
- Developer-friendly setup
- Affordable hosting
- Managed databases
Example: "Startup MVPs", "Side projects", "Simple CRUD apps"

✅ **Self-hosted (Docker)** - Use when:
- Full infrastructure control required
- On-premises deployment
- Custom security requirements
- Cost optimization at scale
Example: "Enterprise internal tools", "Compliance-heavy apps", "High-volume APIs"

**DEPLOYMENT DECISION TREE:**

1. Is it Next.js?
   → YES: **Vercel** (unless needs custom server, then Railway)
   
2. Is it a static site (no backend)?
   → YES: **Netlify** or **Vercel**
   
3. Is it a backend API with database?
   → Node.js/Python/Go: **Railway** or **Render**
   → Java/C#/.NET: **AWS** or **Render**
   
4. Does it need multi-region/edge?
   → YES: **Fly.io** or **Cloudflare Workers**
   
5. Does it need complex infrastructure?
   → YES: **AWS/GCP/Azure** or **Self-hosted Docker**

6. Default for full-stack apps: **Railway** (easiest for most cases)

**EXAMPLE ARCHITECTURE DECISIONS:**

Project: "Next.js SaaS with Stripe"
→ Hosting: "Vercel" (Next.js optimized)
→ Database: "Vercel Postgres" or "Railway PostgreSQL"
→ Reason: "Vercel provides best Next.js DX, edge functions, auto-scaling"

Project: "Express API + PostgreSQL + Redis"
→ Hosting: "Railway" (all services in one platform)
→ Database: "Railway PostgreSQL"
→ Cache: "Railway Redis"
→ Reason: "Railway supports all services, easy setup, affordable"

Project: "FastAPI + ML models + PostgreSQL"
→ Hosting: "Render" (good Python support)
→ Database: "Render PostgreSQL"
→ Reason: "Render handles Python dependencies well, supports background workers"

**INFRASTRUCTURE ARCHITECTURE FORMAT:**

"infrastructureArchitecture": {
  "hosting": "Railway",  // ← Must be one of: Vercel, Railway, Render, Fly.io, Netlify, AWS, GCP, Azure, DigitalOcean, Self-hosted
  "cicd": "GitHub Actions",  // ← Usually GitHub Actions or GitLab CI
  "monitoring": "Sentry + LogTail",  // ← Based on platform
  "scaling": "Container auto-scaling",  // ← Based on platform capabilities
  "deploymentReason": "Railway chosen for Node.js API with PostgreSQL - provides integrated database, auto-deploys, affordable pricing"  // ← REQUIRED: Explain why this platform
}
Project: "React SPA + Node API + MongoDB"
→ Frontend: "Netlify" (static site)
→ Backend: "Railway" (Node API)
→ Database: "MongoDB Atlas" (managed)
→ Reason: "Separation of concerns, optimal for each component"

**INFRASTRUCTURE ARCHITECTURE FORMAT:**

"infrastructureArchitecture": {
  "hosting": "Railway",  // ← Must be one of: Vercel, Railway, Render, Fly.io, Netlify, AWS, GCP, Azure, DigitalOcean, Self-hosted
  "cicd": "GitHub Actions",  // ← Usually GitHub Actions or GitLab CI
  "monitoring": "Sentry + LogTail",  // ← Based on platform
  "scaling": "Container auto-scaling",  // ← Based on platform capabilities
  "deploymentReason": "Railway chosen for Node.js API with PostgreSQL - provides integrated database, auto-deploys, affordable pricing"  // ← REQUIRED: Explain why this platform
}
  
REQUIREMENTS:
1. **CRITICAL - ATOMIC TASKS ONLY**: Each task MUST be truly atomic:
   - ✅ Simple: 1 file, 1 endpoint, OR 1 component (50-150 lines max)
   - ⚠️ Medium: 2-3 tightly related files (150-300 lines total)
   - ❌ Complex: NEVER create tasks >300 lines - split them further!

2. **Task Granularity Examples:**
   ✅ GOOD: "Create User model in Prisma schema"
   ✅ GOOD: "Implement POST /api/users endpoint"
   ✅ GOOD: "Create UserCard component with props"
   ❌ BAD: "Build entire authentication system"
   ❌ BAD: "Create all user management features"
   ❌ BAD: "Implement frontend and backend for users"

3. **Complexity Guidelines:**
   - Simple (1-3 hours): Single file, clear scope, no external dependencies
   - Medium (3-6 hours): 2-3 files, moderate integration
   - Complex: SPLIT INTO SMALLER TASKS!

4. Break features into ATOMIC tasks (each task = 1-6 hours max, preferably 1-3)
5. Create proper dependencies (no circular dependencies)
6. Organize tasks into logical phases (Foundation, Core Features, Integration, Polish)
7. Be specific about files, endpoints, and components
8. Include clear acceptance criteria for each task
9. Prioritize tasks: 1 (must do first) to 5 (nice to have)
10. Identify the critical path
11. **ESTIMATED LINES**: Include estimated lines of code for each task


CATEGORIES:
- frontend: UI components, pages, layouts
- backend: API routes, server logic, business logic
- database: Schema, migrations, queries
- devops: Deployment, CI/CD, infrastructure
- integration: Third-party APIs, external services
- testing: Unit tests, integration tests, E2E tests

Respond with ONLY valid JSON, no markdown or explanations.
`.trim();
  }

  /**
   * Parse AI response into structured execution plan
   */
  private parsePlanningResponse(responseText: string): ExecutionPlan {
    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const parsed = JSON.parse(cleanedText);

      // Validate required fields
      if (
        !parsed.architecture ||
        !parsed.tasks ||
        !Array.isArray(parsed.tasks)
      ) {
        throw new Error("Invalid planning response format");
      }

      return parsed as ExecutionPlan;
    } catch (error) {
      logger.error(`[${this.name}] Failed to parse AI response:`, responseText);
      throw new Error(
        "Failed to parse planning response. AI returned invalid format."
      );
    }
  }

  /**
   * Validate plan structure
   */
  private validatePlan(plan: ExecutionPlan): void {
    // Check for circular dependencies
    const taskIds = new Set(plan.tasks.map((t) => t.id));

    for (const task of plan.tasks) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          throw new Error(`Task ${task.id} has invalid dependency: ${depId}`);
        }
      }
    }

    // Check for tasks with no path to completion
    // (All tasks should either have no dependencies or depend on valid tasks)
    // This is a simplified check - full cycle detection would be more complex

    logger.info(`[${this.name}] Plan validation passed`);
  }

  /**
   * Validate tasks are truly atomic
   */
  private validateTaskAtomicity(tasks: AtomicTask[]): {
    valid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    for (const task of tasks) {
      // Check 1: Complexity must be simple or medium only
      if (task.complexity === ("complex" as any)) {
        issues.push(`Task "${task.id}" is marked as complex - must be split!`);
      }

      // Check 2: Estimated hours should be reasonable
      if (task.estimatedHours > 8) {
        issues.push(
          `Task "${task.id}" has ${task.estimatedHours}h estimate - too large!`
        );
        suggestions.push(`Split "${task.title}" into smaller sub-tasks`);
      }

      // Check 3: Estimated lines should be reasonable
      if (task.estimatedLines > 300) {
        issues.push(
          `Task "${task.id}" has ${task.estimatedLines} lines estimate - too large!`
        );
        suggestions.push(`Break "${task.title}" into 2-3 smaller tasks`);
      }

      // Check 4: File count should be limited
      if (task.technicalDetails.files.length > 3) {
        issues.push(
          `Task "${task.id}" affects ${task.technicalDetails.files.length} files - too many!`
        );
        suggestions.push(
          `Create separate tasks for each file in "${task.title}"`
        );
      }

      // Check 5: Should have clear acceptance criteria
      if (task.acceptanceCriteria.length === 0) {
        issues.push(`Task "${task.id}" has no acceptance criteria`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * Store planning results in database
   */
  private async storePlanningResults(
    projectId: string,
    plan: ExecutionPlan
  ): Promise<void> {
    await prisma.projectContext.update({
      where: { projectId },
      data: {
        executionPlan: plan as any,
        currentPhase: "execution",
        updatedAt: new Date(),
      },
    });

    logger.info(`[${this.name}] Stored execution plan in ProjectContext`);
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
        // Add metadata for execution
        metadata: {
          complexity: task.complexity,
          estimatedLines: task.estimatedLines,
          estimatedHours: task.estimatedHours,
        },
      } as any,
      output: null,
      error: null,
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

  // src/lib/agents/planning/planning-agent.ts
  // ADD these new methods to the existing PlanningAgent class

  /**
   * Analyze user feedback and determine feasibility
   * This is the "utility-based" intelligence you wanted
   */
  async analyzeFeedback(
    projectId: string,
    feedback: {
      freeformFeedback?: string;
      structuredChanges?: {
        taskModifications?: Array<{
          taskId: string;
          action: "modify" | "remove" | "add";
          changes?: Partial<AtomicTask>;
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
    recommendations: string[];
    requiresRegeneration: boolean;
    analysis: string;
  }> {
    logger.info(`[${this.name}] Analyzing user feedback for ${projectId}`);

    try {
      // Step 1: Get current plan
      const context = await prisma.projectContext.findUnique({
        where: { projectId },
        select: { executionPlan: true, techStack: true },
      });

      if (!context?.executionPlan) {
        throw new Error("No execution plan found");
      }

      const currentPlan = context.executionPlan as ExecutionPlan;

      // Step 2: Build AI prompt for analysis
      const prompt = this.buildFeedbackAnalysisPrompt(
        currentPlan,
        context.techStack,
        feedback
      );

      // Step 3: Get AI analysis
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      // Step 4: Parse response
      const analysis = this.parseFeedbackAnalysis(responseText);

      logger.info(`[${this.name}] Feedback analysis complete`, {
        feasible: analysis.feasible,
        warnings: analysis.warnings.length,
        blockers: analysis.blockers.length,
      });

      return analysis;
    } catch (error) {
      logger.error(`[${this.name}] Feedback analysis failed`, error);
      throw error;
    }
  }

  /**
   * Build prompt for feedback analysis
   */
  private buildFeedbackAnalysisPrompt(
    currentPlan: ExecutionPlan,
    techStack: any,
    feedback: any
  ): string {
    return `
You are a world-class software architect analyzing user feedback on an execution plan.

**CURRENT EXECUTION PLAN:**
${JSON.stringify(currentPlan, null, 2)}

**CURRENT TECH STACK:**
${JSON.stringify(techStack, null, 2)}

**USER FEEDBACK:**
${feedback.freeformFeedback || "No freeform feedback"}

**STRUCTURED CHANGES:**
${JSON.stringify(feedback.structuredChanges, null, 2)}

**YOUR TASK:**
Analyze the user's requested changes and determine:

1. **Feasibility**: Can these changes be implemented safely?
2. **Warnings**: What are the potential consequences?
3. **Blockers**: What makes the changes impossible or dangerous?
4. **Recommendations**: What alternative approaches would be better?
5. **Regeneration**: Does the plan need full regeneration or just adjustments?

**CRITICAL ANALYSIS POINTS:**

🔍 **Dependency Impact:**
- If user moves/removes a task, check if other tasks depend on it
- Example: Moving "Create Auth System" from Wave 1 to Wave 3
  ❌ BLOCKER: "User Dashboard" (Wave 2) depends on auth
  💡 RECOMMENDATION: "Keep basic auth in Wave 1, move OAuth to Wave 3"

🔍 **Technical Feasibility:**
- If user requests tech stack changes, verify compatibility
- Example: "Use Firebase Auth instead of NextAuth"
  ⚠️ WARNING: "Requires new dependencies, may increase complexity"
  ✅ FEASIBLE: "Can be done, but will add ~4 hours to Wave 1"

🔍 **Complexity Impact:**
- If changes increase task complexity beyond "medium"
  ❌ BLOCKER: "This would create a 'complex' task (>300 lines)"
  💡 RECOMMENDATION: "Split into 2 separate tasks"

🔍 **Timeline Impact:**
- Calculate how changes affect total estimated hours
- Example: Adding new feature
  ⚠️ WARNING: "Will increase timeline by 2 weeks"

**OUTPUT FORMAT (JSON only, no markdown):**

{
  "feasible": true,
  "warnings": [
    "Moving authentication will delay 3 tasks in Wave 2",
    "Firebase Auth requires ~4 additional hours for setup"
  ],
  "blockers": [],
  "recommendations": [
    "Keep core authentication in Wave 1 (login/logout/session)",
    "Move advanced features (OAuth providers, 2FA) to Wave 3",
    "This maintains dependencies while meeting your goal"
  ],
  "requiresRegeneration": false,
  "analysis": "The requested changes are feasible with minor adjustments. I recommend keeping basic authentication in Wave 1 to avoid blocking dependent tasks, but we can move the advanced OAuth features to Wave 3 as you requested. This approach maintains the critical path while giving you the flexibility you want."
}

**IMPORTANT:**
- Be honest about blockers - don't say "feasible" if it will break the plan
- Provide specific, actionable recommendations
- Explain consequences clearly so user can make informed decision
- If user's request is dangerous/impossible, say so and explain why
`.trim();
  }

  /**
   * Parse AI feedback analysis
   */
  private parseFeedbackAnalysis(responseText: string): {
    feasible: boolean;
    warnings: string[];
    blockers: string[];
    recommendations: string[];
    requiresRegeneration: boolean;
    analysis: string;
  } {
    try {
      const cleaned = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      return JSON.parse(cleaned);
    } catch (error) {
      logger.error(`[${this.name}] Failed to parse feedback analysis`, {
        error,
        preview: responseText.substring(0, 500),
      });

      // Fallback
      return {
        feasible: false,
        warnings: [],
        blockers: ["Failed to analyze feedback - please try again"],
        recommendations: [],
        requiresRegeneration: false,
        analysis: "Analysis failed",
      };
    }
  }

  /**
   * Apply feedback changes to plan
   * Only called AFTER user reviews consequences and clicks "Proceed"
   */
  async applyFeedback(
    projectId: string,
    feedback: any,
    analysisResult: any
  ): Promise<PlanningOutput> {
    logger.info(`[${this.name}] Applying feedback to plan for ${projectId}`);

    try {
      const context = await prisma.projectContext.findUnique({
        where: { projectId },
        select: { executionPlan: true, techStack: true, blueprint: true },
      });

      if (!context?.executionPlan) {
        throw new Error("No execution plan found");
      }

      const currentPlan = context.executionPlan as ExecutionPlan;

      // If regeneration required, start from scratch
      if (analysisResult.requiresRegeneration) {
        logger.info(`[${this.name}] Full regeneration required`);

        return await this.regeneratePlanWithFeedback(
          projectId,
          context,
          feedback
        );
      }

      // Otherwise, apply incremental changes
      const updatedPlan = await this.applyIncrementalChanges(
        currentPlan,
        feedback,
        analysisResult
      );

      // Store updated plan
      await this.storePlanningResults(projectId, updatedPlan);

      // Update tasks in database
      await this.updateAgentTasks(projectId, updatedPlan.tasks);

      // Increment revision count
      await prisma.projectContext.update({
        where: { projectId },
        data: {
          planRevisionCount: { increment: 1 },
          planFeedback: feedback as any,
        },
      });

      return {
        success: true,
        message: "Plan updated successfully based on your feedback",
        plan: updatedPlan,
      };
    } catch (error) {
      logger.error(`[${this.name}] Failed to apply feedback`, error);
      throw error;
    }
  }

  /**
   * Apply incremental changes without full regeneration
   */
  private async applyIncrementalChanges(
    currentPlan: ExecutionPlan,
    feedback: any,
    analysisResult: any
  ): Promise<ExecutionPlan> {
    const updatedPlan = JSON.parse(JSON.stringify(currentPlan)); // Deep clone

    // Apply structured changes
    if (feedback.structuredChanges?.taskModifications) {
      for (const mod of feedback.structuredChanges.taskModifications) {
        const taskIndex = updatedPlan.tasks.findIndex(
          (t: AtomicTask) => t.id === mod.taskId
        );

        if (taskIndex === -1) continue;

        if (mod.action === "remove") {
          updatedPlan.tasks.splice(taskIndex, 1);
        } else if (mod.action === "modify" && mod.changes) {
          Object.assign(updatedPlan.tasks[taskIndex], mod.changes);
        }
      }
    }

    // Apply priority changes
    if (feedback.structuredChanges?.priorityChanges) {
      for (const change of feedback.structuredChanges.priorityChanges) {
        const task = updatedPlan.tasks.find(
          (t: AtomicTask) => t.id === change.taskId
        );
        if (task) {
          task.priority = change.newPriority;
        }
      }
    }

    // Recalculate phases and critical path
    updatedPlan.totalEstimatedHours = updatedPlan.tasks.reduce(
      (sum: number, t: AtomicTask) => sum + t.estimatedHours,
      0
    );

    return updatedPlan;
  }

  /**
   * Regenerate entire plan with feedback incorporated
   */
  private async regeneratePlanWithFeedback(
    projectId: string,
    context: any,
    feedback: any
  ): Promise<PlanningOutput> {
    logger.info(`[${this.name}] Regenerating plan with feedback`);

    // Build enhanced prompt with feedback
    const promptWithFeedback = `
${this.buildPlanningPrompt(context)}

**USER FEEDBACK TO INCORPORATE:**
${feedback.freeformFeedback || ""}

${JSON.stringify(feedback.structuredChanges, null, 2)}

Please regenerate the execution plan taking the user's feedback into account.
`;

    const result = await this.model.generateContent(promptWithFeedback);
    const responseText = result.response.text();
    const newPlan = this.parsePlanningResponse(responseText);

    return {
      success: true,
      message: "Plan regenerated with your feedback",
      plan: newPlan,
    };
  }

  /**
   * Update existing AgentTask records
   */
  private async updateAgentTasks(
    projectId: string,
    updatedTasks: AtomicTask[]
  ): Promise<void> {
    // Delete all existing tasks
    await prisma.agentTask.deleteMany({
      where: { projectId, status: "pending" },
    });

    // Create new tasks
    await this.createAgentTasks(projectId, updatedTasks);

    logger.info(`[${this.name}] Updated ${updatedTasks.length} agent tasks`);
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

export const planningAgent = new PlanningAgent();
