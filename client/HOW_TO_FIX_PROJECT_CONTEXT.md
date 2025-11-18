# How to Fix Project Context Issues

Your agents are failing because they don't have enough context about your project's tech stack and architecture. Here's how to fix it:

## Option 1: Use Prisma Studio (Recommended - Visual)

### Step 1: Open Prisma Studio
```bash
npx prisma studio
```

This will open a web interface at `http://localhost:5555`

### Step 2: Navigate to ProjectContext Table
1. Click on "ProjectContext" in the left sidebar
2. You'll see all project contexts (or it will be empty if none exist)

### Step 3: Check Your Projects
1. First, go to the "Project" table
2. Find your project and copy its ID
3. Check if it has a corresponding entry in "ProjectContext"

### Step 4: Update or Create Context

If context exists, click on it and update these fields:

**techStack** (JSON):
```json
{
  "language": "TypeScript",
  "frontend": {
    "framework": "Next.js 15",
    "uiLibrary": "shadcn/ui"
  },
  "backend": {
    "framework": "Next.js API Routes",
    "runtime": "Node.js"
  },
  "database": {
    "type": "PostgreSQL",
    "name": "neondb"
  },
  "styling": "Tailwind CSS",
  "deployment": "Vercel",
  "authentication": "NextAuth"
}
```

**architecture** (JSON):
```json
{
  "apiPattern": "Next.js API Routes",
  "fileStructure": {
    "api": "app/api/[resource]/route.ts",
    "components": "src/components",
    "lib": "src/lib"
  },
  "patterns": {
    "api": "RESTful endpoints in app/api",
    "database": "Prisma Client in src/lib/prisma.ts",
    "validation": "Zod schemas",
    "errorHandling": "Try-catch with HTTP status codes",
    "authentication": "Session-based with NextAuth"
  },
  "conventions": {
    "naming": "camelCase for variables, PascalCase for components",
    "fileNaming": "kebab-case for files",
    "imports": "Absolute imports with @ alias"
  }
}
```

**codebase** (JSON):
```json
{
  "githubRepoUrl": "https://github.com/your-username/your-repo",
  "githubRepoName": "your-username/your-repo",
  "mainBranch": "main",
  "rootPath": "./client"
}
```

If context doesn't exist, click "Add record" and:
1. Set `projectId` to your project's ID
2. Fill in `techStack`, `architecture`, and `codebase` as JSON (see above)
3. Click "Save 1 change"

## Option 2: Update via SQL (Advanced)

If you prefer SQL, connect to your database and run:

```sql
-- First, find your project
SELECT id, name, status FROM "Project" ORDER BY "createdAt" DESC LIMIT 5;

-- Then insert or update context (replace PROJECT_ID_HERE with your actual project ID)
INSERT INTO "ProjectContext" ("projectId", "techStack", "architecture", "codebase")
VALUES (
  'PROJECT_ID_HERE',
  '{"language": "TypeScript", "frontend": {"framework": "Next.js 15"}, "backend": {"framework": "Next.js API Routes"}, "database": {"type": "PostgreSQL"}}'::jsonb,
  '{"apiPattern": "Next.js API Routes", "patterns": {"api": "RESTful endpoints"}}'::jsonb,
  '{"githubRepoUrl": "https://github.com/your-repo"}'::jsonb
)
ON CONFLICT ("projectId")
DO UPDATE SET
  "techStack" = EXCLUDED."techStack",
  "architecture" = EXCLUDED."architecture",
  "codebase" = EXCLUDED."codebase";
```

## Option 3: Let Planning Agent Do It (Best for new projects)

When you start a new project, make sure your planning agent generates complete context. Update your planning agent to:

1. **Detect tech stack** from existing code (package.json, file structure)
2. **Infer architecture patterns** from folder structure
3. **Save context** to ProjectContext table after analysis

Add this to your PlanningAgent:
```typescript
// After generating the blueprint, save context
await prisma.projectContext.upsert({
  where: { projectId },
  create: {
    projectId,
    techStack: detectedTechStack,
    architecture: inferredArchitecture,
    codebase: { githubRepoUrl, githubRepoName }
  },
  update: {
    techStack: detectedTechStack,
    architecture: inferredArchitecture
  }
});
```

## Verify the Fix

After updating, retry your failed task. The agent should now:
1. Log: "Context has X warning(s), using defaults" (if still incomplete)
2. Or successfully use your provided context
3. Generate code without "task description too abstract" errors

## What Each Agent Needs

### BackendAgent
- ✅ `techStack.backend.framework` (e.g., "Next.js API Routes")
- ✅ `techStack.database.type` (e.g., "PostgreSQL")
- ✅ `architecture.patterns` (API structure, folder conventions)

### FrontendAgent
- ✅ `techStack.frontend.framework` (e.g., "Next.js 15", "React")
- ✅ `techStack.frontend.uiLibrary` (e.g., "shadcn/ui", "Material-UI")
- ✅ `techStack.styling` (e.g., "Tailwind CSS")

### DatabaseAgent
- ✅ `techStack.database.type` (e.g., "PostgreSQL", "MongoDB")
- ✅ `techStack.database.orm` or check if Prisma is in deps
- ✅ `architecture.patterns.database` (e.g., "Prisma Client in src/lib/prisma.ts")

## Quick Test

After fixing context, test with a simple task:
```
Task: Create a GET /api/test endpoint that returns { message: "Hello World" }
```

If the agent generates proper Next.js API route code, your context is working!

---

**Need help?** Check the agent logs for "Context has X warning(s)" to see what's still missing.
