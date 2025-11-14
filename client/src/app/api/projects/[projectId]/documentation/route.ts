// src/app/api/projects/[projectId]/documentation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { createApiLogger } from "@/lib/logger";
import { env } from "@/lib/env";

interface DocSection {
  id: string;
  title: string;
  content: string;
}

/**
 * GET /api/projects/[projectId]/documentation
 * Generate and return project documentation based on actual project data
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const logger = createApiLogger({
    path: "/api/projects/[projectId]/documentation",
    method: "GET",
  });

  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await context.params;

    // 2. Fetch project context with all relevant data
    const projectContext = await prisma.projectContext.findUnique({
      where: { projectId },
      select: {
        userId: true,
        projectId: true,
        techStack: true,
        architecture: true,
        codebase: true,
        executionPlan: true,
        currentPhase: true,
        conversation: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!projectContext) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 3. Verify ownership
    if (projectContext.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Get deployment info
    const deployments = await prisma.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        environment: true,
        deploymentUrl: true,
        status: true,
        platform: true,
        deployedAt: true,
      },
    });

    // 5. Generate documentation sections based on actual project data
    const documentation: DocSection[] = [
      generateReadme(projectContext, deployments),
      generateApiDocs(projectContext),
      generateArchitectureDocs(projectContext),
      generateDeploymentDocs(projectContext, deployments),
    ];

    logger.info("Documentation generated successfully", {
      projectId,
      sections: documentation.length,
    });

    return NextResponse.json({
      documentation,
      projectName: projectContext.conversation.title,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to generate documentation", error as Error);
    return NextResponse.json(
      { error: "Failed to generate documentation" },
      { status: 500 }
    );
  }
}

/**
 * Generate README documentation
 */
function generateReadme(
  projectContext: any,
  deployments: any[]
): DocSection {
  const techStack = projectContext.techStack;
  const architecture = projectContext.architecture;
  const codebase = projectContext.codebase;
  const projectName = projectContext.conversation.title;

  const productionDeployment = deployments.find(
    (d) => d.environment === "production" && d.status === "deployed"
  );

  let techStackSection = "";
  const database = techStack?.database || "PostgreSQL";
  if (techStack) {
    const frontend = techStack.frontend || "React";
    const backend = techStack.backend || "Node.js";

    techStackSection = `## Tech Stack

- **Frontend**: ${frontend}${techStack.frontendFramework ? ` with ${techStack.frontendFramework}` : ""}
- **Backend**: ${backend}${techStack.backendFramework ? ` with ${techStack.backendFramework}` : ""}
- **Database**: ${database}${techStack.orm ? ` with ${techStack.orm}` : ""}
${techStack.additional ? `- **Additional**: ${Array.isArray(techStack.additional) ? techStack.additional.join(", ") : techStack.additional}` : ""}`;
  }

  const repoUrl = codebase?.githubRepoUrl || codebase?.githubRepoName
    ? `https://github.com/${codebase.githubRepoName}`
    : "<repository-url>";

  const deploymentSection = productionDeployment
    ? `
## Live Deployment

🚀 **Production URL**: [${productionDeployment.deploymentUrl}](${productionDeployment.deploymentUrl})

Platform: ${productionDeployment.platform}
Last Deployed: ${new Date(productionDeployment.deployedAt).toLocaleDateString()}
`
    : "";

  const content = `# ${projectName}

> This project was built using NeuraLaunch's AI-powered agent system

## Overview

${architecture?.description || "A modern full-stack application with automated development, testing, and deployment."}

${deploymentSection}

## Features

${generateFeaturesList(architecture)}

${techStackSection}

## Getting Started

### Prerequisites

${generatePrerequisites(techStack)}

### Installation

\`\`\`bash
# Clone the repository
git clone ${repoUrl}
cd ${projectName.toLowerCase().replace(/\s+/g, "-")}

# Install dependencies
${techStack?.packageManager === "yarn" ? "yarn install" : techStack?.packageManager === "pnpm" ? "pnpm install" : "npm install"}

# Set up environment variables
cp .env.example .env.local

${database !== "none" ? "# Run database migrations\nnpx prisma migrate dev\n" : ""}
# Start development server
${techStack?.packageManager === "yarn" ? "yarn dev" : techStack?.packageManager === "pnpm" ? "pnpm dev" : "npm run dev"}
\`\`\`

## Project Structure

\`\`\`
${generateProjectStructure(techStack, architecture)}
\`\`\`

## Available Scripts

${generateScripts(techStack)}

## Environment Variables

${generateEnvVars(codebase)}

## Development

This project follows modern best practices:

- ✅ Type-safe with TypeScript
- ✅ Automated testing
- ✅ Code quality checks
- ✅ CI/CD pipeline
- ✅ Security scanning

## Contributing

This project was generated by NeuraLaunch AI agents. For modifications:

1. Review the existing code patterns
2. Maintain type safety
3. Write tests for new features
4. Follow the established architecture

## License

MIT License - See LICENSE file for details

---

**Generated by [NeuraLaunch](https://neuralaunch.com)** 🚀`;

  return {
    id: "readme",
    title: "README",
    content,
  };
}

/**
 * Generate API documentation
 */
function generateApiDocs(projectContext: any): DocSection {
  const architecture = projectContext.architecture;
  const techStack = projectContext.techStack;

  const baseUrl =
    env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const apiEndpoints =
    architecture?.apiArchitecture?.endpoints ||
    architecture?.backendArchitecture?.apiEndpoints ||
    [];

  let endpointsSection = "";

  if (Array.isArray(apiEndpoints) && apiEndpoints.length > 0) {
    endpointsSection = apiEndpoints
      .map(
        (endpoint: any) => `
#### ${endpoint.method} ${endpoint.path}

${endpoint.description || ""}

${
  endpoint.requestBody
    ? `**Request Body:**
\`\`\`json
${JSON.stringify(endpoint.requestBody, null, 2)}
\`\`\``
    : ""
}

${
  endpoint.response
    ? `**Response:**
\`\`\`json
${JSON.stringify(endpoint.response, null, 2)}
\`\`\``
    : ""
}
`
      )
      .join("\n");
  } else {
    // Default endpoints
    endpointsSection = `
### Example Endpoints

#### GET /api/items

Get all items.

**Response:**
\`\`\`json
{
  "items": [
    {
      "id": "string",
      "name": "string",
      "createdAt": "ISO8601"
    }
  ]
}
\`\`\`

#### POST /api/items

Create a new item.

**Request Body:**
\`\`\`json
{
  "name": "string",
  "description": "string"
}
\`\`\`

**Response:**
\`\`\`json
{
  "id": "string",
  "name": "string",
  "createdAt": "ISO8601"
}
\`\`\`

#### GET /api/items/[id]

Get a specific item by ID.

**Response:**
\`\`\`json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
\`\`\`

#### DELETE /api/items/[id]

Delete an item.

**Response:**
\`\`\`json
{
  "success": true,
  "message": "Item deleted successfully"
}
\`\`\`
`;
  }

  const content = `# API Documentation

## Base URL

\`\`\`
${baseUrl}/api
\`\`\`

## Authentication

${
  architecture?.authentication
    ? `This API uses ${architecture.authentication.type || "session-based"} authentication.

${architecture.authentication.description || ""}`
    : "Authentication is required for all API endpoints. Include authentication credentials in your requests."
}

## Endpoints

${endpointsSection}

## Error Handling

All endpoints return standard HTTP status codes:

- \`200\` - Success
- \`201\` - Created
- \`400\` - Bad Request
- \`401\` - Unauthorized
- \`403\` - Forbidden
- \`404\` - Not Found
- \`500\` - Internal Server Error

Error response format:
\`\`\`json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
\`\`\`

## Rate Limiting

${
  architecture?.rateLimiting
    ? `- ${architecture.rateLimiting.requests} requests per ${architecture.rateLimiting.window}`
    : `- 100 requests per minute per user
- 1000 requests per hour per user`
}

## Content Type

All requests and responses use \`application/json\` content type.

## Timestamps

All timestamps are returned in ISO 8601 format: \`YYYY-MM-DDTHH:mm:ss.sssZ\``;

  return {
    id: "api",
    title: "API Documentation",
    content,
  };
}

/**
 * Generate architecture documentation
 */
function generateArchitectureDocs(projectContext: any): DocSection {
  const architecture = projectContext.architecture;
  const techStack = projectContext.techStack;

  const frontendArch = architecture?.frontendArchitecture || {};
  const backendArch = architecture?.backendArchitecture || {};
  const databaseArch = architecture?.databaseArchitecture || {};

  const content = `# Architecture Overview

## System Architecture

${architecture?.description || "This application follows a modern full-stack architecture with clear separation of concerns."}

## High-Level Components

\`\`\`
┌─────────────────────────────────────────┐
│         Client (Browser)                │
│  ┌────────────────────────────────────┐ │
│  │     ${techStack?.frontend || "Frontend Application"}      │ │
│  │  - UI Components                   │ │
│  │  - State Management                │ │
│  │  - API Integration                 │ │
│  └────────────────────────────────────┘ │
└─────────────────┬───────────────────────┘
                  │ HTTP${architecture?.websockets ? "/WebSocket" : ""}
┌─────────────────▼───────────────────────┐
│         ${techStack?.backend || "Backend"} Server               │
│  ┌────────────────────────────────────┐ │
│  │     API Layer                      │ │
│  │  - RESTful endpoints               │ │
│  │  - Business logic                  │ │
│  │  - Authentication                  │ │
│  └────────────────────────────────────┘ │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Database Layer                  │
│  ┌────────────────────────────────────┐ │
│  │     ${techStack?.database || "Database"}                   │ │
│  │  - Data persistence                │ │
│  │  - Relationships                   │ │
│  │  - Migrations                      │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
\`\`\`

## Frontend Architecture

${
  frontendArch.pattern
    ? `### Architecture Pattern: ${frontendArch.pattern}

${frontendArch.description || ""}`
    : ""
}

### Component Structure

${frontendArch.componentStructure || "- **Pages**: Top-level route components\n- **Components**: Reusable UI components\n- **Hooks**: Custom React hooks\n- **Utils**: Helper functions and utilities"}

### State Management

${frontendArch.stateManagement || "Centralized state management with modern patterns"}

### Styling

${frontendArch.styling || techStack?.styling || "Modern CSS-in-JS or utility-first CSS"}

## Backend Architecture

${
  backendArch.pattern
    ? `### Architecture Pattern: ${backendArch.pattern}

${backendArch.description || ""}`
    : ""
}

### API Design

${backendArch.apiDesign || "RESTful API with clear resource-based endpoints"}

### Business Logic

${backendArch.businessLogic || "Service layer pattern for business logic separation"}

### Data Access

${backendArch.dataAccess || techStack?.orm ? `ORM-based data access with ${techStack.orm}` : "Structured data access layer"}

## Database Schema

${
  databaseArch.schema
    ? `### Schema Design

${databaseArch.schema}`
    : `### Key Models

${generateDatabaseModels(databaseArch)}`
}

## Security

${generateSecuritySection(architecture)}

## Performance

${generatePerformanceSection(architecture)}

## Scalability

${generateScalabilitySection(architecture)}`;

  return {
    id: "architecture",
    title: "Architecture",
    content,
  };
}

/**
 * Generate deployment documentation
 */
function generateDeploymentDocs(
  projectContext: any,
  deployments: any[]
): DocSection {
  const architecture = projectContext.architecture;
  const codebase = projectContext.codebase;

  const platform =
    architecture?.infrastructureArchitecture?.hosting || "Cloud Platform";

  const deploymentHistory =
    deployments.length > 0
      ? deployments
          .map(
            (d) =>
              `- **${d.environment}**: ${d.status} on ${d.platform} ${d.deployedAt ? `(${new Date(d.deployedAt).toLocaleDateString()})` : ""}`
          )
          .join("\n")
      : "No deployments yet";

  const content = `# Deployment Guide

## Deployment Platform

This project is configured for deployment to **${platform}**.

## Deployment History

${deploymentHistory}

## Environment Setup

### Required Environment Variables

${generateEnvVars(codebase)}

### Platform Configuration

${generatePlatformConfig(platform, architecture)}

## Deployment Process

### Automatic Deployment

Every push to the main branch triggers an automatic deployment:

1. Code is pushed to GitHub
2. CI/CD pipeline runs tests
3. Build is created
4. Deployment to ${platform}
5. Health checks run
6. Traffic is routed to new deployment

### Manual Deployment

To deploy manually:

\`\`\`bash
# Build the project
npm run build

# Deploy to ${platform}
${getDeployCommand(platform)}
\`\`\`

## Monitoring

${
  architecture?.monitoring
    ? `Monitoring is set up with the following services:

${JSON.stringify(architecture.monitoring, null, 2)}`
    : `- Health check endpoint: \`/api/health\`
- Error tracking: Enabled
- Performance monitoring: Enabled
- Uptime monitoring: Configured`
}

## Rollback

To rollback to a previous deployment:

\`\`\`bash
${getRollbackCommand(platform)}
\`\`\`

## CI/CD Pipeline

${
  codebase?.githubRepoName
    ? `The project uses GitHub Actions for CI/CD:

- **Build**: Automated builds on every commit
- **Test**: Full test suite runs
- **Deploy**: Automatic deployment on main branch
- **Preview**: Preview deployments for pull requests`
    : "Continuous integration and deployment configured"
}

## Performance Optimization

- Edge caching enabled
- Image optimization
- Code splitting
- Lazy loading
- Bundle size optimization

## Security

- HTTPS enforced
- Security headers configured
- DDoS protection
- Rate limiting enabled
- Regular security scans`;

  return {
    id: "deployment",
    title: "Deployment",
    content,
  };
}

// Helper functions

function generateFeaturesList(architecture: any): string {
  if (architecture?.features && Array.isArray(architecture.features)) {
    return architecture.features.map((f: string) => `- ${f}`).join("\n");
  }

  return `- Full-stack application architecture
- Type-safe development with TypeScript
- Automated testing and quality assurance
- CI/CD pipeline for seamless deployments
- Production-ready monitoring and logging`;
}

function generatePrerequisites(techStack: any): string {
  const items = [];

  if (techStack?.runtime) {
    items.push(`- ${techStack.runtime} installed`);
  } else {
    items.push("- Node.js 18+ installed");
  }

  if (techStack?.packageManager) {
    items.push(`- ${techStack.packageManager} package manager`);
  } else {
    items.push("- npm or yarn package manager");
  }

  if (techStack?.database && techStack.database !== "none") {
    items.push(`- ${techStack.database} database (local or remote)`);
  }

  return items.join("\n");
}

function generateProjectStructure(techStack: any, architecture: any): string {
  const isNextJs = techStack?.frontendFramework?.includes("Next.js");

  if (isNextJs) {
    return `/src
  /app          # Next.js app router pages
  /components   # React components
  /lib          # Utility functions
  /types        # TypeScript types
/prisma         # Database schema and migrations
/public         # Static assets`;
  }

  return `/src
  /pages        # Application pages
  /components   # Reusable components
  /services     # API services
  /utils        # Helper functions
  /types        # Type definitions
/public         # Static files`;
}

function generateScripts(techStack: any): string {
  return `- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm run start\` - Start production server
- \`npm run lint\` - Run ESLint
- \`npm run test\` - Run tests
${techStack?.orm === "Prisma" ? "- `npm run db:migrate` - Run database migrations\n- `npm run db:studio` - Open Prisma Studio" : ""}`;
}

function generateEnvVars(codebase: any): string {
  if (codebase?.agentRequiredEnvKeys && Array.isArray(codebase.agentRequiredEnvKeys)) {
    return `Create a \`.env.local\` file with the following variables:

\`\`\`bash
${codebase.agentRequiredEnvKeys.map((key: string) => `${key}="your_value_here"`).join("\n")}
\`\`\``;
  }

  return `Create a \`.env.local\` file with necessary environment variables:

\`\`\`bash
DATABASE_URL="your_database_url"
API_KEY="your_api_key"
\`\`\``;
}

function generateDatabaseModels(databaseArch: any): string {
  if (databaseArch.models && Array.isArray(databaseArch.models)) {
    return databaseArch.models.map((m: string) => `- **${m}**`).join("\n");
  }

  return "- User accounts and authentication\n- Application data models\n- Relational data structures";
}

function generateSecuritySection(architecture: any): string {
  return `- HTTPS enforced in production
- CSRF protection enabled
- SQL injection prevention
- XSS protection
- Input validation and sanitization
- Secure authentication
- Rate limiting on sensitive endpoints`;
}

function generatePerformanceSection(architecture: any): string {
  return `- Optimized database queries
- Caching strategies
- Code splitting
- Lazy loading
- Image optimization
- CDN for static assets`;
}

function generateScalabilitySection(architecture: any): string {
  return `- Stateless application design
- Horizontal scaling ready
- Database connection pooling
- Async job processing
- Load balancing support`;
}

function generatePlatformConfig(platform: string, architecture: any): string {
  const platformLower = platform.toLowerCase();

  if (platformLower.includes("vercel")) {
    return `Configure in \`vercel.json\`:

\`\`\`json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
\`\`\``;
  }

  if (platformLower.includes("railway")) {
    return `Configure using Railway CLI or web interface. No special configuration needed for most Next.js projects.`;
  }

  return `Follow ${platform} documentation for platform-specific configuration.`;
}

function getDeployCommand(platform: string): string {
  const platformLower = platform.toLowerCase();

  if (platformLower.includes("vercel")) {
    return "vercel --prod";
  }

  if (platformLower.includes("railway")) {
    return "railway up";
  }

  return `# Deploy to ${platform}\n${platform.toLowerCase()} deploy`;
}

function getRollbackCommand(platform: string): string {
  const platformLower = platform.toLowerCase();

  if (platformLower.includes("vercel")) {
    return "vercel rollback <deployment-url>";
  }

  return `# Platform-specific rollback command\n${platform.toLowerCase()} rollback`;
}
