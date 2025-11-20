// src/lib/agents/execution/frontend-agent.ts
/**
 * Frontend Agent - WITH FIX MODE
 * Now supports fixing issues found by Critic Agent
 */

import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { AI_MODELS } from "@/lib/models";
import { logger } from "@/lib/logger";
import { toError, toLogContext } from "@/lib/error-utils";
import { createThoughtStream } from "../thought-stream";

export class FrontendAgent extends BaseAgent {
  constructor() {
    super({
      name: "FrontendAgent",
      category: "execution",
      description:
        "Specialized in frontend implementation: UI components, styling, client-side logic",
      supportedTaskTypes: ["frontend", "ui", "component", "styling"],
      requiredTools: [
        "filesystem",
        "git",
        "command",
        "web_search",
        "code_analysis",
        "context_loader",
        "image_generation",
        "video_generation",
      ],
      modelName: AI_MODELS.CLAUDE,
    });
  }

  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { projectId, userId, taskDetails, context: _context } = input;
    const thoughts = createThoughtStream(projectId, this.config.name);

    const isFixMode = taskDetails.mode === "fix";

    if (isFixMode) {
      return await this.executeFixMode(input);
    }

    logger.info(
      `[${this.config.name}] Executing frontend task: "${taskDetails.title}"`
    );

    try {
      await thoughts.starting(`frontend implementation: ${taskDetails.title}`);

      // 1. Load Context
      await thoughts.analyzing("task requirements and dependencies");
      const existingContext = await this.loadExistingContext(input);

      // 2. Conduct Research
      const researchNotes = await this.conductResearch(input);

      // 3. Generate Implementation
      // ✅ We call buildGenericPrompt here, which uses the helper methods
      const prompt = this.buildGenericPrompt(
        input,
        existingContext,
        researchNotes
      );

      const responseText = await this.generateContent(
        prompt,
        undefined,
        false, // Tools disabled during generation
        { projectId, userId }
      );

      const implementation = this.parseImplementation(responseText);

      if (!implementation) {
        await thoughts.error("Failed to generate implementation plan");
        return {
          success: false,
          message: "Failed to generate implementation",
          iterations: 1,
          durationMs: 0,
          error: "AI generation failed",
        };
      }

      // 4. Write Files
      await thoughts.executing(`writing ${implementation.files.length} files`);
      const filesResult = await this.writeFiles(implementation.files, {
        projectId,
        userId,
      });

      if (!filesResult.success) {
        return {
          success: false,
          message: "Failed to write files",
          iterations: 1,
          durationMs: 0,
          error: filesResult.error,
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
          },
        };
      }

      // 5. Run Commands
      await thoughts.executing(
        `running ${implementation.commands.length} setup commands`
      );
      const commandsResult = await this.runCommands(implementation.commands, {
        projectId,
        userId,
      });

      if (!commandsResult.success) {
        return {
          success: false,
          message: "Failed to execute commands",
          iterations: 1,
          durationMs: 0,
          error: commandsResult.error,
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
            commands: commandsResult.commands,
          },
        };
      }

      // 6. Self-Verify
      await thoughts.analyzing("verifying implementation quality");
      const verification = this.verifyImplementation(
        filesResult.files,
        commandsResult.commands,
        taskDetails
      );

      if (!verification.passed) {
        return {
          success: false,
          message: "Verification failed",
          iterations: 1,
          durationMs: 0,
          error: verification.issues.join("; "),
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
            commands: commandsResult.commands,
          },
        };
      }

      await thoughts.completing(
        `Successfully implemented ${filesResult.files.length} files`
      );

      return {
        success: true,
        message: `Frontend task completed: ${taskDetails.title}`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: filesResult.files,
          filesData: filesResult.filesData,
          commands: commandsResult.commands,
          explanation: implementation.explanation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `[${this.config.name}] Task execution failed`,
        toError(error)
      );
      await thoughts.error(`Task execution failed: ${errorMessage}`);

      return {
        success: false,
        message: "Task execution failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * ✅ NEW: Execute in fix mode
   */
  private async executeFixMode(
    input: AgentExecutionInput
  ): Promise<AgentExecutionOutput> {
    const { projectId, userId, taskDetails, context } = input;

    try {
      // Step 1: Load the files that need fixing
      const issuesToFix = taskDetails.issuesToFix as Array<{
        file: string;
        issue: string;
      }>;
      const filesToFix = issuesToFix.map((issue) => issue.file);
      const uniqueFiles = Array.from(new Set(filesToFix));

      logger.info(
        `[${this.config.name}] Loading ${uniqueFiles.length} files to fix`
      );

      const existingFiles = await this.loadFilesToFix(
        projectId,
        userId,
        uniqueFiles
      );

      // Step 2: Generate fixes using AI
      const fixPrompt = this.buildFixPrompt(
        issuesToFix,
        existingFiles,
        taskDetails.attempt as number,
        context
      );

      // ✅ FIXED: Disable tools for fix generation
      const responseText = await this.generateContent(
        fixPrompt,
        undefined, // No system instruction
        false, // DISABLE tools - direct JSON output prevents empty responses
        { projectId, userId }
      );

      const fixes = this.parseFixResponse(responseText);

      if (!fixes || fixes.files.length === 0) {
        return {
          success: false,
          message: "Failed to generate fixes",
          iterations: 1,
          durationMs: 0,
          error: "AI could not generate fixes",
        };
      }

      // Step 3: Apply fixes
      const filesResult = await this.writeFiles(fixes.files, {
        projectId,
        userId,
      });

      if (!filesResult.success) {
        return {
          success: false,
          message: "Failed to write fixed files",
          iterations: 1,
          durationMs: 0,
          error: filesResult.error,
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
          },
        };
      }

      // Step 4: Run any necessary commands after fixes
      const commandsResult = await this.runCommands(fixes.commands || [], {
        projectId,
        userId,
      });

      logger.info(
        `[${this.config.name}] Fix attempt ${String(taskDetails.attempt)} complete`,
        {
          filesFixed: filesResult.files.length,
          issuesAddressed: issuesToFix.length,
        }
      );

      return {
        success: true,
        message: `Fixed ${issuesToFix.length} issues in ${filesResult.files.length} files`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: filesResult.files,
          filesData: filesResult.filesData,
          commands: commandsResult.commands,
          issuesFixed: issuesToFix.length,
          fixExplanation: fixes.explanation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.config.name}] Fix mode failed`, toError(error));

      return {
        success: false,
        message: "Fix attempt failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Load existing files that need fixing
   */
  private async loadFilesToFix(
    projectId: string,
    userId: string,
    filePaths: string[]
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.executeTool(
          "filesystem",
          { operation: "read", path: filePath },
          { projectId, userId }
        );

        const data = result.data as { content?: string };
        if (result.success && data?.content) {
          files.push({
            path: filePath,
            content: data.content,
          });
        }
      } catch (error) {
        logger.warn(`[${this.config.name}] Failed to load file: ${filePath}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return files;
  }

  /**
   * Build fix prompt for AI (Frontend-specific)
   */
  private buildFixPrompt(
    issues: Array<{
      file: string;
      issue: string;
      line?: number;
      severity?: string;
      category?: string;
      message?: string;
      suggestion?: string;
      codeSnippet?: string;
    }>,
    existingFiles: Array<{ path: string; content: string }>,
    attempt: number,
    context: Record<string, unknown>
  ): string {
    interface FrontendTechStack {
      framework?: string;
      language?: string;
      styling?: string;
      stateManagement?: string;
      router?: string;
      formLibrary?: string;
      uiLibrary?: string;
    }
    const techStack: { frontend?: FrontendTechStack } =
      (context.techStack as { frontend?: FrontendTechStack }) || {};
    const frontend = techStack.frontend ?? {};
    const framework = frontend.framework || "React";
    const language = frontend.language || "TypeScript";
    const styling = frontend.styling || "Tailwind CSS";

    const issuesSummary = issues
      .map(
        (issue, i) => `
**Issue ${i + 1}:**
- File: ${issue.file}
- Line: ${issue.line || "N/A"}
- Severity: ${issue.severity}
- Category: ${issue.category}
- Problem: ${issue.message}
- Suggestion: ${issue.suggestion}
${issue.codeSnippet ? `- Code Snippet:\n\`\`\`\n${issue.codeSnippet}\n\`\`\`` : ""}
    `
      )
      .join("\n");

    const filesSummary = existingFiles
      .map(
        (file) => `
**File: ${file.path}**
\`\`\`
${file.content}
\`\`\`
    `
      )
      .join("\n");

    return `
You are the Frontend Agent in FIX MODE. Your job is to fix UI/component issues found by the Critic Agent.

**FIX ATTEMPT: ${attempt}**

**REQUIRED TECH STACK:**
- Framework: ${framework}
- Language: ${language}
- Styling: ${styling}

**ISSUES TO FIX:**
${issuesSummary}

**EXISTING FILES (with issues):**
${filesSummary}

**CRITICAL INSTRUCTIONS:**

1. **FIX ALL ISSUES** - Address every issue listed above
2. **MAINTAIN TECH STACK** - Use ${framework} with ${language}
3. **PRESERVE FUNCTIONALITY** - Don't break existing working UI
4. **FOLLOW FRAMEWORK CONVENTIONS** - ${framework}-specific best practices
5. **COMPLETE FILES** - Return FULL fixed file content

**FIX STRATEGIES:**

For **XSS/Security Issues**:
- Sanitize user input before rendering
- Use framework's built-in escaping (e.g., JSX auto-escaping)
- Avoid dangerouslySetInnerHTML / v-html without sanitization
- Validate props and user input

For **Accessibility Issues**:
- Add proper ARIA labels
- Use semantic HTML elements
- Ensure keyboard navigation
- Add proper alt text for images

For **Performance Issues**:
- Memoize expensive computations
- Use proper key props in lists
- Avoid unnecessary re-renders
- Optimize component structure

For **Type Safety Issues** (if TypeScript):
- Add proper prop types
- Fix type mismatches
- Use proper interfaces/types
- Add type assertions where needed

For **Code Quality Issues**:
- Follow ${framework} conventions
- Improve component structure
- Better naming
- Add comments for complex logic

**${framework}-SPECIFIC FIX PATTERNS:**

${this.getFrameworkFixPatterns(framework)}

**OUTPUT FORMAT (JSON only):**

\`\`\`json
{
  "files": [
    {
      "path": "exact/path/to/component.${this.getFileExtension(framework, language)}",
      "content": "COMPLETE FIXED FILE CONTENT HERE"
    }
  ],
  "commands": [
    "npm install <package> (if needed for fix)"
  ],
  "explanation": "Brief explanation of what was fixed and why"
}
\`\`\`

**IMPORTANT:**
- NO markdown code blocks around JSON
- Use ${framework} conventions
- Use ${language} syntax
- Style with ${styling}
- Files must be COMPLETE (not diffs)
- Fix ALL issues
- **ALL COMMANDS MUST BE NON-INTERACTIVE** (use --yes, -y, --defaults flags)
- For shadcn/ui: use "npx shadcn-ui@latest init --defaults --yes" or "npx shadcn-ui@latest add <component> -y"

Generate the fixes now.
`.trim();
  }

  /**
   * Get framework-specific fix patterns
   */
  private getFrameworkFixPatterns(framework: string): string {
    const patterns: Record<string, string> = {
      React: `
**React Fix Patterns:**

XSS Prevention:
\`\`\`tsx
// ❌ BAD
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ GOOD
<div>{DOMPurify.sanitize(userInput)}</div>
// OR simply
<div>{userInput}</div> // React auto-escapes
\`\`\`

Accessibility:
\`\`\`tsx
// ❌ BAD
<div onClick={handleClick}>Click me</div>

// ✅ GOOD
<button onClick={handleClick} aria-label="Submit form">
  Click me
</button>
\`\`\`

Type Safety:
\`\`\`tsx
// ❌ BAD
function Component(props: any)

// ✅ GOOD
interface ComponentProps {
  name: string;
  onClick: () => void;
}
function Component({ name, onClick }: ComponentProps)
\`\`\`
      `,

      Vue: `
**Vue Fix Patterns:**

XSS Prevention:
\`\`\`vue
<!-- ❌ BAD -->
<div v-html="userInput"></div>

<!-- ✅ GOOD -->
<div>{{ userInput }}</div>
<!-- OR with sanitization -->
<div v-html="sanitize(userInput)"></div>
\`\`\`

Type Safety:
\`\`\`vue
<script setup lang="ts">
// ❌ BAD
const props = defineProps({
  name: String
})

// ✅ GOOD
interface Props {
  name: string;
  age: number;
}
const props = defineProps<Props>()
</script>
\`\`\`
      `,

      Angular: `
**Angular Fix Patterns:**

XSS Prevention:
\`\`\`typescript
// ❌ BAD
template: \`<div [innerHTML]="userInput"></div>\`

// ✅ GOOD
constructor(private sanitizer: DomSanitizer) {}
get safeHtml() {
  return this.sanitizer.sanitize(SecurityContext.HTML, this.userInput);
}
\`\`\`

Type Safety:
\`\`\`typescript
// ❌ BAD
@Input() data: any;

// ✅ GOOD
@Input() data!: UserData;
\`\`\`
      `,
    };

    return (
      patterns[framework] ||
      "Follow standard best practices for your framework."
    );
  }

  /**
   * Parse fix response from AI
   */
  private parseFixResponse(responseText: string): {
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null {
    try {
      let cleaned = responseText.trim();
      cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");

      const parsed = JSON.parse(cleaned) as {
        files?: Array<{ path: string; content: string }>;
        commands?: string[];
        explanation?: string;
      };

      return {
        files: parsed.files || [],
        commands: parsed.commands || [],
        explanation: parsed.explanation || "No explanation provided",
      };
    } catch (error) {
      logger.error(
        `[${this.config.name}] Failed to parse fix response`,
        error instanceof Error ? error : new Error(String(error)),
        { preview: responseText.substring(0, 500) }
      );
      return null;
    }
  }

  private async conductResearch(
    input: AgentExecutionInput
  ): Promise<string | null> {
    const { taskDetails, projectId, userId } = input;
    const description = taskDetails.description.toLowerCase();
    const needsResearch =
      description.includes("install") ||
      description.includes("setup") ||
      description.includes("library") ||
      description.includes("integrate");

    if (!needsResearch) return null;

    logger.info(`[${this.config.name}] Researching: ${taskDetails.title}`);
    try {
      const result = await this.executeTool(
        "web_search",
        {
          query: `${taskDetails.title} ${taskDetails.description} documentation example`,
          maxResults: 2,
        },
        { projectId, userId }
      );
      if (result.success && result.data) {
        const searchData = result.data as {
          results: Array<{ title: string; description: string }>;
        };
        const summary = searchData.results
          .map((r) => `Title: ${r.title}\nInfo: ${r.description}`)
          .join("\n\n");
        return `\n**🔍 RESEARCH NOTES:**\n${summary}\n`;
      }
    } catch (e) {
      logger.warn(`[${this.config.name}] Research failed.`);
    }
    return null;
  }

  private async loadExistingContext(input: AgentExecutionInput): Promise<{
    structure: string;
    existingFiles: Array<{ path: string; content: string }>;
    dependencies: string;
  }> {
    const { projectId, userId, taskDetails } = input;
    try {
      const structureResult = await this.executeTool(
        "context_loader",
        { operation: "scan_structure" },
        { projectId, userId }
      );

      const filesResult = await this.executeTool(
        "context_loader",
        {
          operation: "smart_load",
          taskDescription: taskDetails.description,
          pattern: "src/**/*.{ts,tsx,jsx,css,vue,svelte}",
          maxFiles: 50,
          maxSize: 1000000,
        },
        { projectId, userId }
      );

      const depsResult = await this.executeTool(
        "context_loader",
        { operation: "load_dependencies" },
        { projectId, userId }
      );

      return {
        structure: structureResult.success
          ? JSON.stringify(structureResult.data, null, 2)
          : "No structure available",
        existingFiles: filesResult.success
          ? (
              filesResult.data as {
                files?: Array<{ path: string; content: string }>;
              }
            ).files || []
          : [],
        dependencies: depsResult.success
          ? JSON.stringify(depsResult.data, null, 2)
          : "No dependencies loaded",
      };
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to load context`,
        toLogContext(error)
      );
      return { structure: "", existingFiles: [], dependencies: "" };
    }
  }

  /**
   * Build generic frontend prompt
   * ✅ FIXED: Now actually uses getFrameworkSpecificRequirements and getPackageManager
   */
  private buildGenericPrompt(
    input: AgentExecutionInput,
    existingContext: {
      structure: string;
      existingFiles: Array<{ path: string; content: string }>;
      dependencies: string;
    },
    researchNotes: string | null
  ): string {
    const { taskDetails, context } = input;
    const techStack = (context.techStack as { frontend?: { framework?: string; language?: string; styling?: string } }) || {};
    const frontend = techStack.frontend || {};
    const framework = frontend.framework || "React";
    const language = frontend.language || "TypeScript";
    const styling = frontend.styling || "Tailwind CSS";

    return `
You are the Frontend Agent, a specialized UI/component code generation expert.

**🎯 CRITICAL: BUILD ON EXISTING CODE, DON'T START FROM SCRATCH**
You are working on a project that may already have UI components and pages.
Review the "Existing Codebase" section below carefully.

**Task:**
- Title: ${taskDetails.title}
- Description: ${taskDetails.description}

${researchNotes ? researchNotes : ""}

**REQUIRED TECH STACK:**
- Framework: ${framework}
- Language: ${language}
- Styling: ${styling}

**Existing Codebase:**
${
  existingContext.existingFiles.length > 0
    ? existingContext.existingFiles
        .map((f) => `[${f.path}]:\n${f.content.substring(0, 1000)}`)
        .join("\n")
    : "No files found."
}

**Installed Dependencies (Version Context):**
${existingContext.dependencies}

**Available Tools:**
${this.getToolsDescription()}

**FRAMEWORK REQUIREMENTS:**
${this.getFrameworkSpecificRequirements(framework, language, styling)}

**OUTPUT FORMAT:**
Respond with ONLY valid JSON:

\`\`\`json
{
  "files": [
    {
      "path": "src/components/UserCard.${this.getFileExtension(framework, language)}",
      "content": "// COMPLETE FILE CONTENT HERE"
    }
  ],
  "commands": [
    "${this.getPackageManager(framework)} install lucide-react"
  ],
  "explanation": "Brief explanation"
}
\`\`\`

**CRITICAL REMINDERS:**
- **ALL commands MUST use non-interactive flags (--yes, -y, --defaults)**
`.trim();
  }

  /**
   * Get framework-specific requirements and patterns
   */
  private getFrameworkSpecificRequirements(
    framework: string,
    language: string,
    styling: string
  ): string {
    const requirements: Record<string, string> = {
      React: `
**React-Specific Requirements:**
- Use functional components with hooks
- Proper TypeScript types for props (if using TS)
- Component file structure: export default at bottom
- Use \`use client\` directive if Next.js client component
- Props destructuring for cleaner code
- Proper event handler naming (handleClick, handleSubmit)
- Key props for lists
- Fragment or semantic HTML (avoid unnecessary divs)
- Custom hooks for reusable logic
${styling === "Tailwind CSS" ? "- Tailwind classes directly on elements" : ""}
${styling === "CSS Modules" ? "- Import styles as: import styles from './Component.module.css'" : ""}
${styling === "Styled Components" ? "- Use styled-components for styling" : ""}

**Example Structure:**
\`\`\`tsx
import { useState } from 'react';

interface UserCardProps {
  name: string;
  email: string;
}

export default function UserCard({ name, email }: UserCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="...">
      {/* Component content */}
    </div>
  );
}
\`\`\`
      `,

      "Next.js": `
**Next.js-Specific Requirements:**
- Use \`use client\` for client components
- Use \`use server\` for server actions
- App Router conventions (app directory)
- Proper metadata exports for pages
- Image optimization with next/image
- Link component from next/link
- Server vs Client component decision
${styling === "Tailwind CSS" ? "- Tailwind classes directly on elements" : ""}

**Example Structure:**
\`\`\`tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function UserCard({ name, email }) {
  return (
    <div className="...">
      <Image src="/avatar.png" alt={name} width={48} height={48} />
    </div>
  );
}
\`\`\`
      `,

      Vue: `
**Vue-Specific Requirements:**
- Use Composition API with \`<script setup>\`
- Proper TypeScript types with defineProps (if using TS)
- Reactive state with ref() or reactive()
- Computed properties with computed()
- Template syntax for rendering
- v-for with :key for lists
- v-if/v-show for conditional rendering
- Event handlers with @click, @submit
${styling === "Tailwind CSS" ? "- Tailwind classes in template" : ""}

**Example Structure:**
\`\`\`vue
<template>
  <div class="...">
    {{ name }}
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  name: string;
  email: string;
}

const props = defineProps<Props>();
const isExpanded = ref(false);
</script>
\`\`\`
      `,

      Nuxt: `
**Nuxt-Specific Requirements:**
- Use Composition API with \`<script setup>\`
- Auto-imports for Vue and Nuxt composables
- File-based routing
- NuxtLink for navigation
- NuxtImg for images
- useFetch or useAsyncData for data fetching
${styling === "Tailwind CSS" ? "- Tailwind classes in template" : ""}

**Example Structure:**
\`\`\`vue
<template>
  <div class="...">
    <NuxtLink to="/users">Users</NuxtLink>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  name: string;
  email: string;
}>();
</script>
\`\`\`
      `,

      Angular: `
**Angular-Specific Requirements:**
- Use standalone components (Angular 17+)
- TypeScript decorators (@Component, @Input, @Output)
- Reactive forms or template-driven forms
- Dependency injection in constructor
- Lifecycle hooks (ngOnInit, ngOnChanges)
- *ngFor with trackBy for lists
- *ngIf for conditional rendering
- (click), (submit) for event handlers
${styling === "Tailwind CSS" ? "- Tailwind classes in template" : ""}

**Example Structure:**
\`\`\`typescript
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-user-card',
  standalone: true,
  template: \`
    <div class="...">
      {{ name }}
    </div>
  \`,
  styles: [\`
    /* Component styles */
  \`]
})
export class UserCardComponent {
  @Input() name!: string;
  @Input() email!: string;
  
  isExpanded = false;
}
\`\`\`
      `,

      Svelte: `
**Svelte-Specific Requirements:**
- Reactive declarations with $:
- Component props with export let
- Event dispatching with createEventDispatcher
- Two-way binding with bind:
- {#if}, {#each}, {#await} for control flow
- Scoped styles in <style> tag
${styling === "Tailwind CSS" ? "- Tailwind classes in markup" : ""}

**Example Structure:**
\`\`\`svelte
<script lang="ts">
  export let name: string;
  export let email: string;
  
  let isExpanded = false;
  
  $: displayName = name.toUpperCase();
</script>

<div class="...">
  {displayName}
</div>

<style>
  /* Scoped styles */
</style>
\`\`\`
      `,

      SvelteKit: `
**SvelteKit-Specific Requirements:**
- File-based routing with +page.svelte
- Server load functions in +page.server.ts
- Form actions in +page.server.ts
- $app/stores for navigation
- goto from $app/navigation
${styling === "Tailwind CSS" ? "- Tailwind classes in markup" : ""}
      `,

      "Solid.js": `
**Solid.js-Specific Requirements:**
- Fine-grained reactivity with createSignal
- Derived state with createMemo
- Side effects with createEffect
- JSX for templating
- For loops with <For> component
- Conditional rendering with <Show>
${styling === "Tailwind CSS" ? "- Tailwind classes on elements" : ""}

**Example Structure:**
\`\`\`tsx
import { toError, toLogContext } from "@/lib/error-utils";

interface UserCardProps {
  name: string;
  email: string;
}

export default function UserCard(props: UserCardProps) {
  const [isExpanded, setIsExpanded] = createSignal(false);
  
  return (
    <div class="...">
      {props.name}
    </div>
  );
}
\`\`\`
      `,
    };

    return (
      requirements[framework] ||
      `
**${framework} Requirements:**
- Follow ${framework} conventions and best practices
- Use ${language} with proper typing
- Implement ${styling} for styling
- Clean, maintainable code structure
    `
    );
  }

  /**
   * Get file extension based on framework and language
   */
  private getFileExtension(framework: string, language: string): string {
    const extensions: Record<string, string> = {
      "React-TypeScript": "tsx",
      "React-JavaScript": "jsx",
      "Next.js-TypeScript": "tsx",
      "Next.js-JavaScript": "jsx",
      "Vue-TypeScript": "vue",
      "Vue-JavaScript": "vue",
      "Nuxt-TypeScript": "vue",
      "Nuxt-JavaScript": "vue",
      "Angular-TypeScript": "ts",
      "Svelte-TypeScript": "svelte",
      "Svelte-JavaScript": "svelte",
      "SvelteKit-TypeScript": "svelte",
      "Solid.js-TypeScript": "tsx",
      "Solid.js-JavaScript": "jsx",
    };

    const key = `${framework}-${language}`;
    return extensions[key] || extensions[framework] || "tsx";
  }

  /**
   * Get package manager based on framework
   */
  private getPackageManager(framework: string): string {
    const managers: Record<string, string> = {
      React: "npm",
      "Next.js": "npm",
      Vue: "npm",
      Nuxt: "npm",
      Angular: "npm",
      Svelte: "npm",
      SvelteKit: "npm",
      "Solid.js": "npm",
    };

    return managers[framework] || "npm";
  }

  private parseImplementation(text: string): {
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null {
    try {
      const cleaned = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(cleaned) as {
        files: Array<{ path: string; content: string }>;
        commands: string[];
        explanation: string;
      };
    } catch (_e) {
      return null;
    }
  }

  private async writeFiles(
    files: Array<{ path: string; content: string }>,
    context: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    files: Array<{ path: string; lines: number; success: boolean }>;
    filesData: Array<{ path: string; content: string; linesOfCode: number }>;
    error?: string;
  }> {
    const results: Array<{ path: string; lines: number; success: boolean }> =
      [];
    const filesData: Array<{
      path: string;
      content: string;
      linesOfCode: number;
    }> = [];

    for (const file of files) {
      try {
        const result = await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: file.path,
            content: file.content,
          },
          context
        );

        const linesOfCode = file.content.split("\n").length;

        results.push({
          path: file.path,
          lines: linesOfCode,
          success: result.success,
        });

        // Store full file data for UI
        if (result.success) {
          filesData.push({
            path: file.path,
            content: file.content,
            linesOfCode,
          });
        }

        if (!result.success) {
          logger.warn(`[${this.config.name}] File write failed: ${file.path}`, {
            error: result.error,
          });
        }
      } catch (error) {
        logger.error(
          `[${this.config.name}] File write error: ${file.path}`,
          error instanceof Error ? error : new Error(String(error))
        );
        results.push({
          path: file.path,
          lines: 0,
          success: false,
        });
      }
    }

    const allSuccess = results.every((r) => r.success);

    return {
      success: allSuccess,
      files: results,
      filesData,
      error: allSuccess ? undefined : "Some files failed to write",
    };
  }

  private async runCommands(
    commands: string[],
    context: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    commands: Array<{
      command: string;
      success: boolean;
      output: string;
      exitCode: number;
    }>;
    error?: string;
  }> {
    const results: Array<{
      command: string;
      success: boolean;
      output: string;
      exitCode: number;
    }> = [];

    for (const command of commands) {
      try {
        const result = await this.executeTool(
          "command",
          {
            command,
            timeout: 300,
          },
          context
        );

        const data = result.data as { stdout?: string; stderr?: string };
        results.push({
          command,
          success: result.success,
          output: data?.stdout || data?.stderr || result.error || "",
          exitCode: result.success ? 0 : 1, // 0 for success, 1 for failure
        });

        if (!result.success) {
          logger.warn(`[${this.config.name}] Command failed: ${command}`, {
            error: result.error,
          });
        }
      } catch (error) {
        logger.error(
          `[${this.config.name}] Command error: ${command}`,
          toError(error)
        );
        results.push({
          command,
          success: false,
          output: error instanceof Error ? error.message : "Unknown error",
          exitCode: 1, // Non-zero exit code for errors
        });
      }
    }

    const allSuccess = results.every((r) => r.success);

    return {
      success: allSuccess,
      commands: results,
      error: allSuccess ? undefined : "Some commands failed",
    };
  }

  private verifyImplementation(
    files: Array<{ path: string; lines: number; success: boolean }>,
    commands: Array<{ command: string; success: boolean; output: string }>,
    taskDetails: AgentExecutionInput["taskDetails"]
  ): {
    passed: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    const failedFiles = files.filter((f) => !f.success);
    if (failedFiles.length > 0) {
      issues.push(`Failed to create ${failedFiles.length} file(s)`);
    }

    const failedCommands = commands.filter((c) => !c.success);
    if (failedCommands.length > 0) {
      issues.push(`${failedCommands.length} command(s) failed`);
    }

    const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
    const maxLines = taskDetails.estimatedLines * 1.5;

    if (totalLines > maxLines) {
      issues.push(`Code too large: ${totalLines} lines (limit: ${maxLines})`);
    }

    if (totalLines < 10) {
      issues.push(`Code too small: ${totalLines} lines (suspicious)`);
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  }
}

export const frontendAgent = new FrontendAgent();
