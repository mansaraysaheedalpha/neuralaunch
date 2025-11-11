# Planning Agent Implementation Guide

**Version:** 1.0  
**Date:** November 11, 2025  
**Purpose:** Implementation guide for the dual-mode Planning Agent

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Options](#implementation-options)
4. [Detailed Implementation](#detailed-implementation)
5. [API Design](#api-design)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Considerations](#deployment-considerations)

---

## 1. Overview

### Purpose

The Planning Agent is the intelligent orchestrator that converts user input (either freeform vision text or structured blueprints) into executable technical plans for the multi-agent system.

### Dual-Mode Operation

The agent operates in two distinct modes:

1. **Vision Mode**: Processes freeform natural language descriptions
2. **Blueprint Mode**: Processes structured AI-generated blueprints with optional sprint validation data

### Core Responsibilities

- Parse and understand user input
- Extract technical requirements
- Design system architecture
- Break down work into atomic tasks
- Organize tasks into waves
- Define dependencies
- Estimate complexity and duration

---

## 2. Architecture

### High-Level Flow

```
User Input (Vision or Blueprint)
        ↓
Planning Agent Router
        ↓
    ┌───────┴───────┐
    ↓               ↓
Vision Parser   Blueprint Parser
    ↓               ↓
    └───────┬───────┘
            ↓
   Requirements Extractor
            ↓
   Architecture Designer
            ↓
   Task Generator
            ↓
   Wave Organizer
            ↓
  Execution Plan Output
            ↓
  Agent Orchestrator
```

### Data Flow

```typescript
// Input
interface PlanningAgentInput {
  projectId: string;
  userId: string;
  conversationId: string;
  sourceType: "vision" | "blueprint";
  
  // Vision Mode Fields
  visionText?: string;
  projectName?: string;
  techPreferences?: TechStackPreferences;
  
  // Blueprint Mode Fields
  blueprint?: string;
  sprintData?: SprintValidationData;
}

// Output
interface PlanningAgentOutput {
  success: boolean;
  plan: ExecutionPlan;
  metadata: {
    totalTasks: number;
    totalWaves: number;
    estimatedDuration: string;
    techStack: TechStack;
  };
}

interface ExecutionPlan {
  architecture: TechnicalArchitecture;
  waves: Wave[];
  tasks: AtomicTask[];
}
```

---

## 3. Implementation Options

### Option A: Conditional Logic in Single Agent (Recommended)

**Pros:**
- Single source of truth
- Shared task generation logic
- Easier to maintain
- Simpler API surface
- Less code duplication

**Cons:**
- Slightly more complex internal routing
- Single file may become large

**Implementation:**
```typescript
// src/lib/agents/planning/planning-agent.ts

export class PlanningAgent {
  async execute(input: PlanningAgentInput): Promise<PlanningAgentOutput> {
    // Route based on source type
    const requirements = await this.extractRequirements(input);
    const architecture = await this.designArchitecture(requirements);
    const tasks = await this.generateTasks(architecture);
    const waves = await this.organizeWaves(tasks);
    
    return {
      success: true,
      plan: { architecture, waves, tasks },
      metadata: this.calculateMetadata(tasks, waves)
    };
  }
  
  private async extractRequirements(input: PlanningAgentInput) {
    if (input.sourceType === "vision") {
      return await this.extractFromVision(input.visionText!, input.techPreferences);
    } else {
      return await this.extractFromBlueprint(input.blueprint!, input.sprintData);
    }
  }
  
  private async extractFromVision(
    visionText: string,
    preferences?: TechStackPreferences
  ): Promise<Requirements> {
    // Use AI to analyze freeform text
    const prompt = `
      Analyze this project vision and extract:
      1. Core features
      2. User types and roles
      3. Key functionality
      4. Technical requirements
      
      Vision: ${visionText}
      
      Return structured JSON.
    `;
    
    const aiResponse = await this.callAI(prompt);
    return this.parseRequirements(aiResponse);
  }
  
  private async extractFromBlueprint(
    blueprint: string,
    sprintData?: SprintValidationData
  ): Promise<Requirements> {
    // Parse structured blueprint sections
    const sections = this.parseBlueprintSections(blueprint);
    
    // Enhance with sprint validation data if available
    if (sprintData) {
      return this.enhanceWithValidation(sections, sprintData);
    }
    
    return this.convertToRequirements(sections);
  }
}
```

### Option B: Separate Specialized Agents

**Pros:**
- Clear separation of concerns
- Easier to understand each agent's purpose
- Can optimize each agent independently

**Cons:**
- Code duplication
- Two agents to maintain
- More complex API routing

**Implementation:**
```typescript
// src/lib/agents/planning/vision-planning-agent.ts
export class VisionPlanningAgent {
  async execute(input: VisionInput): Promise<PlanningOutput> {
    // Vision-specific logic
  }
}

// src/lib/agents/planning/blueprint-planning-agent.ts
export class BlueprintPlanningAgent {
  async execute(input: BlueprintInput): Promise<PlanningOutput> {
    // Blueprint-specific logic
  }
}

// Router
export async function executePlanning(input: PlanningAgentInput) {
  if (input.sourceType === "vision") {
    return await new VisionPlanningAgent().execute(input);
  } else {
    return await new BlueprintPlanningAgent().execute(input);
  }
}
```

### Recommendation: Option A

Use Option A (Conditional Logic) because:
1. Shared task generation logic reduces bugs
2. Single planning agent is easier to debug
3. Common architecture design patterns
4. Simpler API and fewer moving parts
5. Easier to add new source types in future

---

## 4. Detailed Implementation

### 4.1 Vision Mode Implementation

#### Step 1: Vision Analysis

```typescript
async analyzeVision(visionText: string): Promise<VisionAnalysis> {
  const prompt = `
    You are a technical architect. Analyze this project vision:
    
    "${visionText}"
    
    Extract and identify:
    1. **Application Type**: (web app, mobile app, API, desktop, etc.)
    2. **Core Features**: List of main features
    3. **User Personas**: Types of users
    4. **Key Workflows**: Main user journeys
    5. **Data Models**: Entities that need to be stored
    6. **Integration Needs**: External APIs or services
    7. **Special Requirements**: Performance, security, compliance
    
    Return as JSON.
  `;
  
  const aiResponse = await this.ai.generate(prompt);
  return JSON.parse(aiResponse);
}
```

#### Step 2: Requirements Extraction

```typescript
async extractRequirements(analysis: VisionAnalysis): Promise<Requirements> {
  return {
    functional: this.extractFunctionalRequirements(analysis),
    technical: this.extractTechnicalRequirements(analysis),
    dataModels: this.designDataModels(analysis),
    apis: this.designAPIs(analysis),
    uiComponents: this.identifyUIComponents(analysis)
  };
}
```

#### Step 3: Architecture Design

```typescript
async designArchitecture(requirements: Requirements): Promise<Architecture> {
  const prompt = `
    Given these requirements:
    ${JSON.stringify(requirements, null, 2)}
    
    Design a technical architecture including:
    1. Tech Stack (frontend, backend, database, hosting)
    2. Project Structure (folders, files)
    3. Database Schema
    4. API Endpoints
    5. Component Hierarchy
    6. Authentication Strategy
    
    Return as JSON.
  `;
  
  const design = await this.ai.generate(prompt);
  return JSON.parse(design);
}
```

#### Step 4: Task Generation

```typescript
async generateTasks(architecture: Architecture): Promise<AtomicTask[]> {
  const tasks: AtomicTask[] = [];
  
  // Backend tasks
  tasks.push(...this.generateBackendTasks(architecture));
  
  // Frontend tasks
  tasks.push(...this.generateFrontendTasks(architecture));
  
  // Infrastructure tasks
  tasks.push(...this.generateInfrastructureTasks(architecture));
  
  // Testing tasks
  tasks.push(...this.generateTestingTasks(architecture));
  
  return tasks;
}

private generateBackendTasks(arch: Architecture): AtomicTask[] {
  const tasks: AtomicTask[] = [];
  
  // Database setup
  tasks.push({
    id: generateId(),
    title: "Set up Database Schema",
    description: `Create database schema for: ${arch.dataModels.map(m => m.name).join(", ")}`,
    category: "backend",
    priority: 1,
    estimatedHours: 2,
    estimatedLines: 100,
    complexity: "simple",
    dependencies: [],
    technicalDetails: {
      files: ["prisma/schema.prisma"],
      technologies: ["Prisma", arch.database],
    },
    acceptanceCriteria: [
      "All models defined in Prisma schema",
      "Relationships properly configured",
      "Migration files generated"
    ]
  });
  
  // API endpoints
  for (const endpoint of arch.apiEndpoints) {
    tasks.push({
      id: generateId(),
      title: `Create ${endpoint.method} ${endpoint.path} API`,
      description: endpoint.description,
      category: "backend",
      priority: endpoint.priority,
      estimatedHours: 1.5,
      estimatedLines: 80,
      complexity: "simple",
      dependencies: ["database-setup-task-id"],
      technicalDetails: {
        files: [`src/app/api${endpoint.path}/route.ts`],
        technologies: ["Next.js API Routes", "Prisma"],
        endpoints: [endpoint.path]
      },
      acceptanceCriteria: [
        `${endpoint.method} endpoint implemented`,
        "Request validation added",
        "Error handling implemented",
        "Response format documented"
      ]
    });
  }
  
  return tasks;
}
```

### 4.2 Blueprint Mode Implementation

#### Step 1: Blueprint Parsing

```typescript
async parseBlueprint(blueprint: string): Promise<BlueprintSections> {
  const sections = {
    problem: this.extractSection(blueprint, "## Problem Statement"),
    solution: this.extractSection(blueprint, "## Solution"),
    targetMarket: this.extractSection(blueprint, "## Target Market"),
    features: this.extractSection(blueprint, "## Key Features"),
    techStack: this.extractSection(blueprint, "## Tech Stack"),
    gtm: this.extractSection(blueprint, "## Go-to-Market"),
    businessModel: this.extractSection(blueprint, "## Business Model")
  };
  
  return sections;
}
```

#### Step 2: Sprint Data Integration

```typescript
async enhanceWithValidation(
  sections: BlueprintSections,
  sprintData: SprintValidationData
): Promise<EnhancedRequirements> {
  // Analyze completed validation tasks
  const validatedFeatures = this.extractValidatedFeatures(sprintData);
  const marketFeedback = this.analyzeMarketFeedback(sprintData);
  
  // Prioritize features based on validation
  const prioritizedFeatures = this.prioritizeFeatures(
    sections.features,
    validatedFeatures,
    marketFeedback
  );
  
  return {
    ...this.convertToRequirements(sections),
    featurePriorities: prioritizedFeatures,
    validationInsights: marketFeedback
  };
}
```

#### Step 3: Requirements Conversion

```typescript
async convertToRequirements(sections: BlueprintSections): Promise<Requirements> {
  // Parse features from blueprint
  const features = this.parseFeatureList(sections.features);
  
  // Extract tech stack
  const techStack = this.parseTechStack(sections.techStack);
  
  // Design data models from features
  const dataModels = await this.inferDataModels(features);
  
  // Design APIs from features
  const apis = await this.designAPIsFromFeatures(features, dataModels);
  
  return {
    functional: features,
    technical: { techStack, hosting: "vercel" },
    dataModels,
    apis,
    uiComponents: await this.inferUIComponents(features)
  };
}
```

### 4.3 Wave Organization

```typescript
async organizeWaves(tasks: AtomicTask[]): Promise<Wave[]> {
  const waves: Wave[] = [];
  let waveNumber = 1;
  let remainingTasks = [...tasks];
  
  // Keep creating waves until all tasks are assigned
  while (remainingTasks.length > 0) {
    const wave = this.createWave(waveNumber, remainingTasks);
    waves.push(wave);
    
    // Remove assigned tasks
    remainingTasks = remainingTasks.filter(
      task => !wave.taskIds.includes(task.id)
    );
    
    waveNumber++;
    
    // Safety: prevent infinite loops
    if (waveNumber > 20) {
      throw new Error("Too many waves - check for circular dependencies");
    }
  }
  
  return waves;
}

private createWave(waveNumber: number, availableTasks: AtomicTask[]): Wave {
  const wave: Wave = {
    number: waveNumber,
    taskIds: [],
    agentAssignments: new Map()
  };
  
  // Find tasks with satisfied dependencies
  const eligibleTasks = availableTasks.filter(task =>
    this.areDependenciesSatisfied(task, wave.number)
  );
  
  // Group tasks by agent type
  const tasksByAgent = this.groupTasksByAgent(eligibleTasks);
  
  // Limit tasks per agent per wave (max 3)
  for (const [agent, tasks] of tasksByAgent.entries()) {
    const selectedTasks = tasks.slice(0, 3);
    wave.agentAssignments.set(agent, selectedTasks);
    wave.taskIds.push(...selectedTasks.map(t => t.id));
  }
  
  return wave;
}
```

---

## 5. API Design

### 5.1 Orchestrator Run Endpoint

```typescript
// src/app/api/orchestrator/run/route.ts

export async function POST(request: Request) {
  const body = await request.json();
  
  // Validate input
  const validated = planningInputSchema.parse(body);
  
  // Create project record
  const project = await prisma.project.create({
    data: {
      id: validated.projectId,
      userId: validated.userId,
      name: validated.projectName || "Untitled Project",
      status: "planning",
      conversationId: validated.conversationId
    }
  });
  
  // Trigger planning agent via Inngest
  const { id: runId } = await inngest.send({
    name: "agent/planning.start",
    data: {
      projectId: validated.projectId,
      userId: validated.userId,
      conversationId: validated.conversationId,
      sourceType: validated.sourceType,
      visionText: validated.visionText,
      blueprint: validated.blueprint,
      sprintData: validated.sprintData,
      techPreferences: validated.techPreferences
    }
  });
  
  return NextResponse.json({
    success: true,
    runId,
    projectId: project.id,
    status: "started",
    estimatedDuration: "20-30 minutes"
  });
}
```

### 5.2 Planning Agent Inngest Function

```typescript
// src/inngest/functions/planning-agent-function.ts

export const planningAgentFunction = inngest.createFunction(
  { id: "planning-agent" },
  { event: "agent/planning.start" },
  async ({ event, step }) => {
    const { projectId, sourceType, ...input } = event.data;
    
    // Step 1: Execute Planning Agent
    const plan = await step.run("execute-planning-agent", async () => {
      const agent = new PlanningAgent();
      return await agent.execute({
        projectId,
        sourceType,
        ...input
      });
    });
    
    // Step 2: Store Plan in Database
    await step.run("store-execution-plan", async () => {
      await prisma.projectContext.upsert({
        where: { projectId },
        create: {
          projectId,
          plan: plan.plan as any,
          architecture: plan.plan.architecture as any,
          techStack: plan.metadata.techStack as any,
          updatedAt: new Date()
        },
        update: {
          plan: plan.plan as any,
          architecture: plan.plan.architecture as any,
          techStack: plan.metadata.techStack as any,
          updatedAt: new Date()
        }
      });
    });
    
    // Step 3: Create Agent Tasks
    await step.run("create-agent-tasks", async () => {
      for (const task of plan.plan.tasks) {
        await prisma.agentTask.create({
          data: {
            id: task.id,
            projectId,
            agentName: this.mapCategoryToAgent(task.category),
            status: "pending",
            priority: task.priority,
            waveNumber: this.findTaskWave(task.id, plan.plan.waves),
            input: task as any,
            dependencies: task.dependencies
          }
        });
      }
    });
    
    // Step 4: Trigger Execution Coordinator
    await step.sendEvent("trigger-execution", {
      name: "agent/execution.start",
      data: {
        projectId,
        userId: input.userId,
        conversationId: input.conversationId,
        planId: plan.plan.id
      }
    });
    
    return { success: true, plan };
  }
);
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

```typescript
// Test vision parsing
describe("Vision Mode", () => {
  it("should extract features from simple vision", async () => {
    const input = {
      visionText: "I want to build a todo app with user authentication",
      projectName: "TodoApp"
    };
    
    const requirements = await planningAgent.extractFromVision(input);
    
    expect(requirements.functional).toContain("user authentication");
    expect(requirements.functional).toContain("todo management");
  });
  
  it("should suggest appropriate tech stack", async () => {
    const requirements = {...};
    const architecture = await planningAgent.designArchitecture(requirements);
    
    expect(architecture.techStack.frontend).toBeDefined();
    expect(architecture.techStack.backend).toBeDefined();
  });
});

// Test blueprint parsing
describe("Blueprint Mode", () => {
  it("should parse blueprint sections correctly", async () => {
    const blueprint = `## Key Features\n- Feature 1\n- Feature 2`;
    const sections = await planningAgent.parseBlueprint(blueprint);
    
    expect(sections.features).toContain("Feature 1");
  });
  
  it("should integrate sprint data for prioritization", async () => {
    const sprintData = {
      completedTasks: [...],
      validationResults: {...}
    };
    
    const enhanced = await planningAgent.enhanceWithValidation(
      sections,
      sprintData
    );
    
    expect(enhanced.featurePriorities).toBeDefined();
  });
});
```

### 6.2 Integration Tests

```typescript
describe("End-to-End Planning", () => {
  it("should create complete execution plan from vision", async () => {
    const input = {
      projectId: "test-project",
      userId: "test-user",
      conversationId: "test-conv",
      sourceType: "vision",
      visionText: "Build a blog platform with comments"
    };
    
    const output = await planningAgent.execute(input);
    
    expect(output.success).toBe(true);
    expect(output.plan.tasks.length).toBeGreaterThan(0);
    expect(output.plan.waves.length).toBeGreaterThan(0);
  });
});
```

---

## 7. Deployment Considerations

### 7.1 Environment Variables

```env
# AI Model Configuration
AI_MODEL=gemini-2.0-flash-exp
GOOGLE_GENAI_API_KEY=your-api-key

# Planning Agent Settings
MAX_TASKS_PER_WAVE=3
MAX_WAVES=10
DEFAULT_COMPLEXITY=medium
```

### 7.2 Performance Optimization

- **Caching**: Cache common architecture patterns
- **Streaming**: Stream plan generation for UX
- **Timeouts**: Set reasonable timeouts for AI calls
- **Rate Limiting**: Implement rate limiting for API

### 7.3 Monitoring

- Track planning agent execution time
- Monitor AI token usage
- Alert on planning failures
- Log plan quality metrics

### 7.4 Error Handling

```typescript
try {
  const plan = await planningAgent.execute(input);
} catch (error) {
  if (error instanceof AITimeoutError) {
    // Retry with simpler prompt
  } else if (error instanceof InvalidInputError) {
    // Return user-friendly error
  } else {
    // Log and escalate
    logger.error("Planning agent failed", error);
    throw error;
  }
}
```

---

## Conclusion

This implementation guide provides a comprehensive approach to building a dual-mode Planning Agent that serves as the intelligent entry point for the NeuraLaunch multi-agent system. By following this guide, developers can create a robust, maintainable, and extensible planning system that handles both vision-based and blueprint-based project creation flows.

**Key Takeaways:**
1. Use conditional logic for simpler maintenance
2. Share common task generation logic
3. Leverage AI for requirement extraction
4. Organize tasks into waves with dependencies
5. Test thoroughly with both input modes
6. Monitor performance and quality metrics

For questions or clarifications, refer to the main FRONTEND_VISION.md document.
