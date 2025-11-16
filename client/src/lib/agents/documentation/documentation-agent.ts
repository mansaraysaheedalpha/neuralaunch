// src/lib/agents/documentation/documentation-agent.ts
/**
 * Documentation Agent - Comprehensive Project Documentation Generator
 *
 * Responsibilities:
 * 1. Generate README.md with setup instructions
 * 2. Generate API documentation with endpoints
 * 3. Generate architecture documentation
 * 4. Generate deployment guide
 * 5. Generate user guide (if applicable)
 * 6. Extract environment variables documentation
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
import { Prisma } from "@prisma/client";
import { TechStack } from "@/lib/agents/types/common";

// ==========================================
// TYPES
// ==========================================

export interface DocumentationFile {
  path: string;
  filename: string;
  content: string;
  type:
    | "readme"
    | "api"
    | "architecture"
    | "deployment"
    | "user_guide"
    | "development";
}

export interface APIEndpoint {
  path: string;
  method: string;
  description: string;
  requestBody?: string;
  responseBody?: string;
  authentication?: boolean;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  statusCodes?: Array<{
    code: number;
    description: string;
  }>;
  example?: string;
}

export interface ComponentDocumentation {
  name: string;
  path: string;
  description: string;
  props?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  usage?: string;
}

export interface EnvironmentVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  example?: string;
}

export interface DocumentationGenerationResult {
  filesCreated: string[];
  readme: string;
  apiDocs?: string;
  architectureDocs: string;
  deploymentDocs: string;
  developmentDocs: string;
  userGuide?: string;
  apiEndpoints: APIEndpoint[];
  components: ComponentDocumentation[];
  envVariables: EnvironmentVariable[];
}

export interface DocumentationInput extends AgentExecutionInput {
  includeUserGuide?: boolean;
  includeAPIDocs?: boolean;
  customSections?: Record<string, string>;
}

export interface ProjectStructure {
  files?: Array<{ path: string; [key: string]: unknown } | string>;
  directories?: string[];
  [key: string]: unknown;
}

export interface ProjectContextData {
  techStack: TechStack;
  architecture?: unknown;
}

export interface DatabaseSchema {
  tables?: Array<{
    name: string;
    columns: Array<{ name: string; type: string }>;
  }>;
  [key: string]: unknown;
}

// ==========================================
// DOCUMENTATION AGENT CLASS
// ==========================================

export class DocumentationAgent extends BaseAgent {
  constructor() {
    super({
      name: "DocumentationAgent",
      category: "quality",
      description:
        "Generate comprehensive project documentation for all tech stacks",
      supportedTaskTypes: [
        "documentation_generation",
        "readme_generation",
        "api_docs",
        "architecture_docs",
      ],
      requiredTools: [
        "filesystem",
        "command",
        "code_analysis",
        "context_loader",
        "web_search", // For finding documentation best practices
        "claude_skills", // For superior documentation generation
      ],
      modelName: AI_MODELS.OPENAI, // GPT-4o for best documentation writing
    });
  }

  /**
   * Execute documentation generation
   */
  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const startTime = Date.now();
    const { taskId, projectId, userId, taskDetails } = input;

    logger.info(`[${this.name}] Starting documentation generation`, {
      taskId,
      projectId,
    });

    try {
      // Step 1: Load project context and tech stack
      const projectContext = await this.loadProjectContextData(projectId);

      // Step 2: Load entire project structure
      const projectStructure = await this.loadProjectStructure(
        projectId,
        userId
      );

      // Step 3: Extract API endpoints
      const apiEndpoints = await this.extractAPIEndpoints(
        projectId,
        userId,
        projectStructure,
        projectContext.techStack
      );

      // Step 4: Extract frontend components (if applicable)
      const components = await this.extractComponents(
        projectId,
        userId,
        projectStructure,
        projectContext.techStack
      );

      // Step 5: Extract environment variables
      const envVariables = await this.extractEnvironmentVariables(
        projectId,
        userId
      );

      // Step 6: Extract database schema (if applicable)
      const databaseSchema = await this.extractDatabaseSchema(
        projectId,
        userId,
        projectContext.techStack
      );

      // Step 7: Generate README.md
      const readme = await this.generateREADME(
        projectContext,
        projectStructure,
        apiEndpoints,
        envVariables,
        databaseSchema
      );

      // Step 8: Generate API Documentation
      let apiDocs: string | undefined;
      const docInput = taskDetails as unknown as DocumentationInput;
      if (
        docInput.includeAPIDocs !== false &&
        apiEndpoints.length > 0
      ) {
        apiDocs = await this.generateAPIDocs(
          apiEndpoints,
          projectContext.techStack
        );
      }

      // Step 9: Generate Architecture Documentation
      const architectureDocs = await this.generateArchitectureDocs(
        projectContext,
        projectStructure,
        components,
        databaseSchema
      );

      // Step 10: Generate Deployment Guide
      const deploymentDocs = await this.generateDeploymentDocs(
        projectContext,
        envVariables
      );

      // Step 11: Generate Development Setup Guide
      const developmentDocs = await this.generateDevelopmentDocs(
        projectContext,
        projectStructure
      );

      // Step 12: Generate User Guide (optional)
      let userGuide: string | undefined;
      if (docInput.includeUserGuide) {
        userGuide = await this.generateUserGuide(projectContext, components);
      }

      // Step 13: Write documentation files
      const filesCreated = await this.writeDocumentationFiles(
        projectId,
        userId,
        {
          readme,
          apiDocs,
          architectureDocs,
          deploymentDocs,
          developmentDocs,
          userGuide,
        }
      );

      const result: DocumentationGenerationResult = {
        filesCreated,
        readme,
        apiDocs,
        architectureDocs,
        deploymentDocs,
        developmentDocs,
        userGuide,
        apiEndpoints,
        components,
        envVariables,
      };

      // Step 14: Store documentation results
      await this.storeDocumentationResults(taskId, projectId, result);

      logger.info(`[${this.name}] Documentation generation complete`, {
        taskId,
        filesCreated: filesCreated.length,
        apiEndpoints: apiEndpoints.length,
        components: components.length,
      });

      return {
        success: true,
        message: `Generated ${filesCreated.length} documentation files`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        data: { ...result },
      };
    } catch (error) {
      logger.error(`[${this.name}] Documentation generation failed`, 
        error instanceof Error ? error : new Error(String(error)),
        { taskId }
      );

      return {
        success: false,
        message: `Documentation generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: error instanceof Error ? error.message : "Unknown error",
      } as AgentExecutionOutput;
    }
  }

  /**
   * Load project context from database
   */
  private async loadProjectContextData(projectId: string): Promise<ProjectContextData> {
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

    return {
      techStack: context.techStack as TechStack,
      architecture: context.architecture
    };
  }

  /**
   * Load entire project structure
   */
  private async loadProjectStructure(
    projectId: string,
    userId: string
  ): Promise<ProjectStructure> {
    logger.info(`[${this.name}] Loading project structure`);

    const contextResult = await this.executeTool(
      "context_loader",
      {
        projectId,
        includeFiles: true,
        maxDepth: 6,
      },
      { projectId, userId }
    );

    if (!contextResult.success) {
      throw new Error("Failed to load project structure");
    }

    return contextResult.data as ProjectStructure;
  }

  /**
   * Extract API endpoints from backend code
   */
  private async extractAPIEndpoints(
    projectId: string,
    userId: string,
    projectStructure: ProjectStructure,
    techStack: TechStack
  ): Promise<APIEndpoint[]> {
    logger.info(`[${this.name}] Extracting API endpoints`);

    const endpoints: APIEndpoint[] = [];

    // Find backend files
    const allFiles = projectStructure?.files || [];
    const backendFiles = allFiles.filter((file) => {
      const path = typeof file === 'string' ? file : file.path;
      return (
        path.includes("/api/") ||
        path.includes("/routes/") ||
        path.includes("/controllers/") ||
        path.includes("/handlers/") ||
        path.includes("/endpoints/")
      );
    });

    if (backendFiles.length === 0) {
      logger.info(
        `[${this.name}] No backend files found, skipping API extraction`
      );
      return endpoints;
    }

    // Use AI to extract endpoints
    const prompt = `You are analyzing backend code to extract API endpoint documentation.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

Backend Files:
${backendFiles
  .slice(0, 30)
  .map((f) => typeof f === 'string' ? f : f.path)
  .join("\n")}

Task: Extract all API endpoints and their documentation.

For each endpoint, extract:
1. Path (e.g., "/api/users", "/api/auth/login")
2. HTTP Method (GET, POST, PUT, DELETE, PATCH)
3. Description (what the endpoint does)
4. Request body structure (if POST/PUT/PATCH)
5. Response body structure
6. Authentication required (true/false)
7. Query/path parameters
8. Status codes returned
9. Example curl command

Return JSON array:
[
  {
    "path": "/api/users",
    "method": "GET",
    "description": "Retrieve all users",
    "requestBody": null,
    "responseBody": "{ users: User[] }",
    "authentication": true,
    "parameters": [
      { "name": "limit", "type": "number", "required": false, "description": "Max users to return" }
    ],
    "statusCodes": [
      { "code": 200, "description": "Success" },
      { "code": 401, "description": "Unauthorized" }
    ],
    "example": "curl -H \\"Authorization: Bearer TOKEN\\" http://localhost:3000/api/users"
  }
]

Be thorough and include all endpoints defined in the backend.
Respond ONLY with valid JSON array, no markdown.`;

    try {
      const text = await this.generateContent(prompt);

      // Parse JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as APIEndpoint[];
        endpoints.push(...parsed);
      }
    } catch (error) {
      logger.error(`[${this.name}] Failed to extract API endpoints`, 
        error instanceof Error ? error : new Error(String(error))
      );
    }

    logger.info(`[${this.name}] Extracted ${endpoints.length} API endpoints`);
    return endpoints;
  }

  /**
   * Extract frontend components
   */
  private async extractComponents(
    projectId: string,
    userId: string,
    projectStructure: ProjectStructure,
    techStack: TechStack
  ): Promise<ComponentDocumentation[]> {
    logger.info(`[${this.name}] Extracting frontend components`);

    const components: ComponentDocumentation[] = [];

    // Find component files
    const allFiles = projectStructure?.files || [];
    const componentFiles = allFiles.filter((file) => {
      const path = typeof file === 'string' ? file : file.path;
      return (
        path.includes("/components/") ||
        path.includes("/ui/") ||
        (path.includes("/app/") &&
          (path.endsWith(".tsx") || path.endsWith(".jsx")))
      );
    });

    if (componentFiles.length === 0) {
      logger.info(`[${this.name}] No component files found`);
      return components;
    }

    // Use AI to extract component documentation
    const prompt = `You are analyzing frontend code to extract component documentation.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

Component Files:
${componentFiles
  .slice(0, 30)
  .map((f) => typeof f === 'string' ? f : f.path)
  .join("\n")}

Task: Extract key reusable components and their documentation.

For each component, extract:
1. Name
2. File path
3. Description (what the component does)
4. Props (with types, required/optional, description)
5. Usage example

Return JSON array:
[
  {
    "name": "Button",
    "path": "src/components/ui/button.tsx",
    "description": "Reusable button component with variants",
    "props": [
      { "name": "variant", "type": "string", "required": false, "description": "Button style (default, primary, outline)" },
      { "name": "onClick", "type": "function", "required": false, "description": "Click handler" }
    ],
    "usage": "<Button variant=\\"primary\\" onClick={() => console.log('clicked')}>Click Me</Button>"
  }
]

Focus on reusable UI components, not pages.
Respond ONLY with valid JSON array, no markdown.`;

    try {
      const text = await this.generateContent(prompt);

      // Parse JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ComponentDocumentation[];
        components.push(...parsed);
      }
    } catch (error) {
      logger.error(`[${this.name}] Failed to extract components`, 
        error instanceof Error ? error : new Error(String(error))
      );
    }

    logger.info(`[${this.name}] Extracted ${components.length} components`);
    return components;
  }

  /**
   * Extract environment variables
   */
  private async extractEnvironmentVariables(
    projectId: string,
    userId: string
  ): Promise<EnvironmentVariable[]> {
    logger.info(`[${this.name}] Extracting environment variables`);

    const envVariables: EnvironmentVariable[] = [];

    // Try to read .env.example or .env.local
    const envFiles = [".env.example", ".env.local", ".env"];

    for (const envFile of envFiles) {
      const readResult = await this.executeTool(
        "filesystem",
        {
          operation: "read",
          path: envFile,
        },
        { projectId, userId }
      );

      const data = readResult.data as { content?: string };
      if (readResult.success && data?.content) {
        const content = data.content;

        // Parse environment variables
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();

          // Skip comments and empty lines
          if (trimmed.startsWith("#") || !trimmed) continue;

          // Parse KEY=value
          const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
          if (match) {
            const [, name, value] = match;

            // Determine if required (usually if value is empty or placeholder)
            const required =
              !value || value.includes("your_") || value.includes("CHANGE_ME");

            envVariables.push({
              name,
              description: `Configuration for ${name.toLowerCase().replace(/_/g, " ")}`,
              required,
              defaultValue: value && !required ? value : undefined,
              example: required ? `your_${name.toLowerCase()}` : value,
            });
          }
        }

        // Found env file, stop searching
        break;
      }
    }

    // If no env file found, use AI to extract from code
    if (envVariables.length === 0) {
      logger.info(`[${this.name}] No .env file found, extracting from code`);

      const prompt = `Analyze the project and identify all environment variables used.

Look for:
- env.VARIABLE_NAME
- process.env["VARIABLE_NAME"]
- env.VARIABLE_NAME
- Similar patterns in other languages

Return JSON array:
[
  {
    "name": "DATABASE_URL",
    "description": "PostgreSQL database connection string",
    "required": true,
    "example": "postgresql://user:pass@localhost:5432/db"
  }
]

Respond ONLY with valid JSON array, no markdown.`;

      try {
        const text = await this.generateContent(prompt);

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as EnvironmentVariable[];
          envVariables.push(...parsed);
        }
      } catch (error) {
        logger.error(`[${this.name}] Failed to extract env vars from code`, 
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    logger.info(
      `[${this.name}] Extracted ${envVariables.length} environment variables`
    );
    return envVariables;
  }

  /**
   * Extract database schema
   */
  private async extractDatabaseSchema(
    projectId: string,
    userId: string,
    _techStack: TechStack
  ): Promise<string | null> {
    logger.info(`[${this.name}] Extracting database schema`);

    // Try to read schema files based on tech stack
    const schemaFiles = [
      "prisma/schema.prisma",
      "drizzle/schema.ts",
      "models.py",
      "models/index.js",
      "database/schema.sql",
    ];

    for (const schemaFile of schemaFiles) {
      const readResult = await this.executeTool(
        "filesystem",
        {
          operation: "read",
          path: schemaFile,
        },
        { projectId, userId }
      );

      const data = readResult.data as { content?: string };
      if (readResult.success && data?.content) {
        logger.info(`[${this.name}] Found database schema at ${schemaFile}`);
        return data.content;
      }
    }

    logger.info(`[${this.name}] No database schema file found`);
    return null;
  }

  /**
   * Generate README.md
   */
  private async generateREADME(
    projectContext: ProjectContextData,
    projectStructure: ProjectStructure,
    apiEndpoints: APIEndpoint[],
    envVariables: EnvironmentVariable[],
    databaseSchema: string | null
  ): Promise<string> {
    logger.info(`[${this.name}] Generating README.md`);

    const techStack = projectContext.techStack;
    const architecture = projectContext.architecture;

    const prompt = `Generate a comprehensive, professional README.md for this project.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

Architecture:
${JSON.stringify(architecture, null, 2)}

API Endpoints Count: ${apiEndpoints.length}
Environment Variables Count: ${envVariables.length}
Has Database: ${databaseSchema ? "Yes" : "No"}

The README should include:

1. **Project Title and Description** - Clear overview of what the project does
2. **Features** - Key features and capabilities
3. **Tech Stack** - List of technologies used
4. **Prerequisites** - Software needed to run the project
5. **Installation** - Step-by-step setup instructions
6. **Environment Variables** - Table of required env vars
7. **Database Setup** - How to set up the database (if applicable)
8. **Running the Project** - Development and production commands
9. **Project Structure** - Folder organization
10. **API Documentation** - Link to API.md (if APIs exist)
11. **Testing** - How to run tests
12. **Deployment** - Link to DEPLOYMENT.md
13. **Contributing** - Guidelines for contributors
14. **License** - Project license

Make it:
- ✅ Professional and well-formatted
- ✅ Easy to follow for new developers
- ✅ Include code examples where helpful
- ✅ Use proper markdown syntax
- ✅ Include badges (build status, license, etc.)
- ✅ Comprehensive but not overwhelming

Generate ONLY the README.md content, no explanations.`;

    try {
      const readme = await this.generateContent(prompt);

      // Remove markdown code fences if present
      return readme
        .replace(/```markdown\n?/g, "")
        .replace(/```\n?$/g, "")
        .trim();
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate README`, 
        error instanceof Error ? error : new Error(String(error))
      );
      return this.getFallbackREADME(techStack);
    }
  }

  /**
   * Generate API Documentation
   */
  private async generateAPIDocs(
    apiEndpoints: APIEndpoint[],
    techStack: TechStack
  ): Promise<string> {
    logger.info(`[${this.name}] Generating API documentation`);

    const prompt = `Generate comprehensive API documentation.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

API Endpoints:
${JSON.stringify(apiEndpoints, null, 2)}

The API documentation should include:

1. **Overview** - API description and base URL
2. **Authentication** - How to authenticate
3. **Endpoints** - Full documentation for each endpoint:
   - Method and path
   - Description
   - Request parameters
   - Request body (if applicable)
   - Response format
   - Status codes
   - Example requests and responses
4. **Error Handling** - Common error responses
5. **Rate Limiting** - If applicable
6. **Examples** - curl and code examples

Make it:
- ✅ Clear and easy to understand
- ✅ Include practical examples
- ✅ Well-organized by resource/feature
- ✅ Follow REST best practices format

Generate ONLY the API.md content, no explanations.`;

    try {
      const apiDocs = await this.generateContent(prompt);

      return apiDocs
        .replace(/```markdown\n?/g, "")
        .replace(/```\n?$/g, "")
        .trim();
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate API docs`, 
        error instanceof Error ? error : new Error(String(error))
      );
      return this.getFallbackAPIDocs(apiEndpoints);
    }
  }

  /**
   * Generate Architecture Documentation
   */
  private async generateArchitectureDocs(
    projectContext: ProjectContextData,
    projectStructure: ProjectStructure,
    components: ComponentDocumentation[],
    databaseSchema: string | null
  ): Promise<string> {
    logger.info(`[${this.name}] Generating architecture documentation`);

    const prompt = `Generate detailed architecture documentation.

Project Context:
${JSON.stringify(projectContext, null, 2)}

Components Count: ${components.length}
Has Database: ${databaseSchema ? "Yes" : "No"}

The architecture documentation should include:

1. **Overview** - High-level architecture description
2. **System Architecture** - How components interact
3. **Frontend Architecture** - UI structure and patterns
4. **Backend Architecture** - API design and patterns
5. **Database Design** - Schema and relationships (if applicable)
6. **Data Flow** - How data moves through the system
7. **Key Components** - Important modules and their roles
8. **Design Patterns** - Patterns used in the codebase
9. **Technology Choices** - Why specific technologies were chosen
10. **Scalability Considerations** - How the system can scale

Make it:
- ✅ Technical but accessible
- ✅ Include diagrams (describe them in text)
- ✅ Explain architectural decisions
- ✅ Reference specific files/folders

Generate ONLY the ARCHITECTURE.md content, no explanations.`;

    try {
      const architectureDocs = await this.generateContent(prompt);

      return architectureDocs
        .replace(/```markdown\n?/g, "")
        .replace(/```\n?$/g, "")
        .trim();
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate architecture docs`, 
        error instanceof Error ? error : new Error(String(error))
      );
      return this.getFallbackArchitectureDocs(projectContext);
    }
  }

  /**
   * Generate Deployment Documentation
   */
  private async generateDeploymentDocs(
    projectContext: ProjectContextData,
    envVariables: EnvironmentVariable[]
  ): Promise<string> {
    logger.info(`[${this.name}] Generating deployment documentation`);

    const techStack = projectContext.techStack;

    const prompt = `Generate deployment documentation for this project.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

Environment Variables:
${JSON.stringify(envVariables, null, 2)}

The deployment documentation should include:

1. **Overview** - Deployment options and recommendations
2. **Prerequisites** - What's needed for deployment
3. **Environment Configuration** - Setting up env variables
4. **Database Setup** - Database deployment (if applicable)
5. **Deployment Platforms** - Platform-specific guides:
   - Vercel (if Next.js/frontend)
   - Railway/Render (if backend API)
   - AWS/GCP/Azure (if needed)
6. **CI/CD Setup** - GitHub Actions or similar
7. **Post-Deployment** - Verification steps
8. **Monitoring** - How to monitor the deployed app
9. **Troubleshooting** - Common deployment issues
10. **Rollback** - How to rollback deployments

Make it:
- ✅ Step-by-step instructions
- ✅ Platform-specific where needed
- ✅ Include screenshots descriptions
- ✅ Cover common issues

Generate ONLY the DEPLOYMENT.md content, no explanations.`;

    try {
      const deploymentDocs = await this.generateContent(prompt);

      return deploymentDocs
        .replace(/```markdown\n?/g, "")
        .replace(/```\n?$/g, "")
        .trim();
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate deployment docs`, 
        error instanceof Error ? error : new Error(String(error))
      );
      return this.getFallbackDeploymentDocs(techStack);
    }
  }

  /**
   * Generate Development Setup Guide
   */
  private async generateDevelopmentDocs(
    projectContext: ProjectContextData,
    _projectStructure: ProjectStructure
  ): Promise<string> {
    logger.info(`[${this.name}] Generating development documentation`);

    const techStack = projectContext.techStack;

    const prompt = `Generate development setup documentation for this project.

Tech Stack:
${JSON.stringify(techStack, null, 2)}

The development documentation should include:

1. **Getting Started** - Quick start for new developers
2. **Development Environment Setup** - IDE, extensions, tools
3. **Local Development** - Running the project locally
4. **Code Style** - Formatting, linting, conventions
5. **Git Workflow** - Branching strategy, commit messages
6. **Testing** - How to write and run tests
7. **Debugging** - Tips for debugging
8. **Common Tasks** - Adding features, fixing bugs
9. **Project Scripts** - npm/yarn scripts explained
10. **Troubleshooting** - Common dev issues and fixes

Make it:
- ✅ Beginner-friendly
- ✅ Include examples
- ✅ Reference actual project files
- ✅ Practical and actionable

Generate ONLY the DEVELOPMENT.md content, no explanations.`;

    try {
      const developmentDocs = await this.generateContent(prompt);

      return developmentDocs
        .replace(/```markdown\n?/g, "")
        .replace(/```\n?$/g, "")
        .trim();
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate development docs`, 
        error instanceof Error ? error : new Error(String(error))
      );
      return this.getFallbackDevelopmentDocs(techStack);
    }
  }

  /**
   * Generate User Guide
   */
  private async generateUserGuide(
    projectContext: ProjectContextData,
    components: ComponentDocumentation[]
  ): Promise<string> {
    logger.info(`[${this.name}] Generating user guide`);

    const prompt = `Generate an end-user guide for this application.

Project Context:
${JSON.stringify(projectContext, null, 2)}

Components:
${JSON.stringify(components.slice(0, 10), null, 2)}

The user guide should include:

1. **Introduction** - What the application does
2. **Getting Started** - First steps for new users
3. **Key Features** - Main features and how to use them
4. **User Interface** - Overview of the UI
5. **Common Tasks** - Step-by-step guides for common actions
6. **Tips and Tricks** - Power user features
7. **Troubleshooting** - Common user issues
8. **FAQ** - Frequently asked questions
9. **Support** - How to get help

Make it:
- ✅ Written for non-technical users
- ✅ Include screenshots descriptions
- ✅ Step-by-step instructions
- ✅ Easy to navigate

Generate ONLY the USER_GUIDE.md content, no explanations.`;

    try {
      const userGuide = await this.generateContent(prompt);

      return userGuide
        .replace(/```markdown\n?/g, "")
        .replace(/```\n?$/g, "")
        .trim();
    } catch (error) {
      logger.error(`[${this.name}] Failed to generate user guide`, 
        error instanceof Error ? error : new Error(String(error))
      );
      return "# User Guide\n\n*Coming soon*";
    }
  }

  /**
   * Write documentation files to filesystem
   */
  private async writeDocumentationFiles(
    projectId: string,
    userId: string,
    docs: {
      readme: string;
      apiDocs?: string;
      architectureDocs: string;
      deploymentDocs: string;
      developmentDocs: string;
      userGuide?: string;
    }
  ): Promise<string[]> {
    logger.info(`[${this.name}] Writing documentation files`);

    const filesCreated: string[] = [];

    // Create docs directory
    await this.executeTool(
      "command",
      {
        command: "mkdir -p docs",
      },
      { projectId, userId }
    );

    // Write README.md (root level)
    const readmeResult = await this.executeTool(
      "filesystem",
      {
        operation: "write",
        path: "README.md",
        content: docs.readme,
      },
      { projectId, userId }
    );
    if (readmeResult.success) filesCreated.push("README.md");

    // Write API.md (if exists)
    if (docs.apiDocs) {
      const apiResult = await this.executeTool(
        "filesystem",
        {
          operation: "write",
          path: "docs/API.md",
          content: docs.apiDocs,
        },
        { projectId, userId }
      );
      if (apiResult.success) filesCreated.push("docs/API.md");
    }

    // Write ARCHITECTURE.md
    const archResult = await this.executeTool(
      "filesystem",
      {
        operation: "write",
        path: "docs/ARCHITECTURE.md",
        content: docs.architectureDocs,
      },
      { projectId, userId }
    );
    if (archResult.success) filesCreated.push("docs/ARCHITECTURE.md");

    // Write DEPLOYMENT.md
    const deployResult = await this.executeTool(
      "filesystem",
      {
        operation: "write",
        path: "docs/DEPLOYMENT.md",
        content: docs.deploymentDocs,
      },
      { projectId, userId }
    );
    if (deployResult.success) filesCreated.push("docs/DEPLOYMENT.md");

    // Write DEVELOPMENT.md
    const devResult = await this.executeTool(
      "filesystem",
      {
        operation: "write",
        path: "docs/DEVELOPMENT.md",
        content: docs.developmentDocs,
      },
      { projectId, userId }
    );
    if (devResult.success) filesCreated.push("docs/DEVELOPMENT.md");

    // Write USER_GUIDE.md (if exists)
    if (docs.userGuide) {
      const userResult = await this.executeTool(
        "filesystem",
        {
          operation: "write",
          path: "docs/USER_GUIDE.md",
          content: docs.userGuide,
        },
        { projectId, userId }
      );
      if (userResult.success) filesCreated.push("docs/USER_GUIDE.md");
    }

    logger.info(
      `[${this.name}] Created ${filesCreated.length} documentation files`
    );
    return filesCreated;
  }

  /**
   * Store documentation results in database
   */
  private async storeDocumentationResults(
    taskId: string,
    projectId: string,
    result: DocumentationGenerationResult
  ): Promise<void> {
    try {
      await prisma.agentTask.update({
        where: { id: taskId },
        data: {
          output: result as unknown as Prisma.InputJsonValue,
          status: "completed",
          completedAt: new Date(),
        },
      });

      logger.info(`[${this.name}] Stored documentation results`, { taskId });
    } catch (error) {
      logger.error(`[${this.name}] Failed to store results`, 
        error instanceof Error ? error : new Error(String(error)),
        { taskId }
      );
    }
  }

  /**
   * Fallback README if AI generation fails
   */
  private getFallbackREADME(techStack: TechStack): string {
    const frontend = techStack?.frontend?.framework || "Frontend";
    const backend = techStack?.backend?.framework || "Backend";

    return `# Project

## Description

This project is built with ${frontend} and ${backend}.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Set up environment variables:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Run development server:
   \`\`\`bash
   npm run dev
   \`\`\`

## Documentation

- [API Documentation](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Development Guide](docs/DEVELOPMENT.md)

## License

MIT
`;
  }

  /**
   * Fallback API docs if AI generation fails
   */
  private getFallbackAPIDocs(endpoints: APIEndpoint[]): string {
    let docs = "# API Documentation\n\n## Endpoints\n\n";

    for (const endpoint of endpoints) {
      docs += `### ${endpoint.method} ${endpoint.path}\n\n`;
      docs += `${endpoint.description}\n\n`;

      if (endpoint.authentication) {
        docs += "**Authentication Required:** Yes\n\n";
      }

      if (endpoint.requestBody) {
        docs += `**Request Body:**\n\`\`\`json\n${endpoint.requestBody}\n\`\`\`\n\n`;
      }

      if (endpoint.responseBody) {
        docs += `**Response:**\n\`\`\`json\n${endpoint.responseBody}\n\`\`\`\n\n`;
      }

      if (endpoint.example) {
        docs += `**Example:**\n\`\`\`bash\n${endpoint.example}\n\`\`\`\n\n`;
      }

      docs += "---\n\n";
    }

    return docs;
  }

  /**
   * Fallback architecture docs if AI generation fails
   */
  private getFallbackArchitectureDocs(projectContext: ProjectContextData): string {
    return `# Architecture Documentation

## Overview

This document describes the system architecture.

## Tech Stack

${JSON.stringify(projectContext.techStack, null, 2)}

## Architecture

${JSON.stringify(projectContext.architecture, null, 2)}
`;
  }

  /**
   * Fallback deployment docs if AI generation fails
   */
  private getFallbackDeploymentDocs(techStack: TechStack): string {
    return `# Deployment Guide

## Overview

This document describes how to deploy the application.

## Tech Stack

${JSON.stringify(techStack, null, 2)}

## Deployment Steps

1. Set up environment variables
2. Build the application
3. Deploy to hosting platform
4. Verify deployment

*Detailed instructions coming soon*
`;
  }

  /**
   * Fallback development docs if AI generation fails
   */
  private getFallbackDevelopmentDocs(techStack: TechStack): string {
    return `# Development Guide

## Overview

This document describes the development setup.

## Tech Stack

${JSON.stringify(techStack, null, 2)}

## Development Setup

1. Clone the repository
2. Install dependencies
3. Set up environment variables
4. Run development server

*Detailed instructions coming soon*
`;
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const documentationAgent = new DocumentationAgent();
