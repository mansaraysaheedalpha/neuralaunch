// src/lib/agents/tools/context-loader-tool.ts
/**
 * Context Loader Tool
 * Scans project structure and loads relevant files into agent context
 * Smart file selection based on task requirements
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { SandboxService } from "@/lib/services/sandbox-service";
import { logger } from "@/lib/logger";

interface ProjectContext {
  structure: {
    directories: string[];
    files: Array<{ path: string; size: number; type: string }>;
    totalFiles: number;
    totalSize: number;
  };
  dependencies: {
    packages: Array<{ name: string; version?: string }>;
    devPackages: Array<{ name: string; version?: string }>;
  };
  configuration: {
    packageJson?: any;
    tsconfig?: any;
    eslintrc?: any;
    gitignore?: string[];
  };
  existingFiles: Record<string, string>; // path -> content
  relevantFiles: string[]; // Files relevant to current task
}

export class ContextLoaderTool extends BaseTool {
  name = "context_loader";
  description =
    "Load project structure, dependencies, and relevant files into context";

  parameters: ToolParameter[] = [
    {
      name: "operation",
      type: "string",
      description:
        'Operation: "scan_structure", "load_files", "load_dependencies", "load_config", "smart_load"',
      required: true,
    },
    {
      name: "paths",
      type: "array",
      description: "Specific paths to load (optional)",
      required: false,
    },
    {
      name: "pattern",
      type: "string",
      description: "File pattern to match (e.g., '*.ts', 'api/**/*.ts')",
      required: false,
    },
    {
      name: "taskDescription",
      type: "string",
      description: "Task description to determine relevant files",
      required: false,
    },
    {
      name: "maxFiles",
      type: "number",
      description: "Maximum number of files to load (default: 50)",
      required: false,
      default: 50,
    },
    {
      name: "maxSize",
      type: "number",
      description: "Maximum total size in bytes (default: 1MB)",
      required: false,
      default: 1048576, // 1MB
    },
  ];

  async execute(
    params: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const {
      operation,
      paths,
      pattern,
      taskDescription,
      maxFiles = 20,
      maxSize = 512000,
    } = params;
    const { projectId, userId } = context;

    const startTime = Date.now();

    try {
      this.logExecution("Context loading", { operation, maxFiles });

      switch (operation) {
        case "scan_structure":
          return await this.scanStructure(projectId, userId);

        case "load_files":
          return await this.loadFiles(
            projectId,
            userId,
            paths,
            maxFiles,
            maxSize
          );

        case "load_dependencies":
          return await this.loadDependencies(projectId, userId);

        case "load_config":
          return await this.loadConfiguration(projectId, userId);

        case "smart_load":
          return await this.smartLoad(
            projectId,
            userId,
            taskDescription,
            maxFiles,
            maxSize
          );

        default:
          return {
            success: false,
            error: `Unknown operation: ${operation}`,
          };
      }
    } catch (error) {
      this.logError("Context loading", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Scan project structure
   */
  private async scanStructure(
    projectId: string,
    userId: string
  ): Promise<ToolResult> {
    try {
      // Get directory tree
      const treeResult = await SandboxService.execCommand(
        projectId,
        userId,
        `find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/.next/*" | head -200`,
        30
      );

      if (treeResult.status === "error") {
        return {
          success: false,
          error: "Failed to scan project structure",
        };
      }

      const files = treeResult.stdout.trim().split("\n").filter(Boolean);

      // Categorize files
      const structure: any = {
        directories: new Set<string>(),
        files: [],
        totalFiles: files.length,
        totalSize: 0,
      };

      for (const file of files) {
        const dir = file.substring(0, file.lastIndexOf("/")) || ".";
        structure.directories.add(dir);

        const ext = file.split(".").pop() || "";
        const type = this.getFileType(ext);

        structure.files.push({
          path: file,
          size: 0, // Would need additional call to get size
          type,
        });
      }

      structure.directories = Array.from(structure.directories);

      return {
        success: true,
        data: {
          structure,
          filesByType: this.groupFilesByType(structure.files),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Structure scan failed",
      };
    }
  }

  /**
   * Load specific files
   */
  private async loadFiles(
    projectId: string,
    userId: string,
    paths: string[] = [],
    maxFiles: number = 50,
    maxSize: number = 1048576 // 1MB
  ): Promise<ToolResult> {
    try {
      const loadedFiles: Record<string, string> = {};
      let totalSize = 0;
      let filesLoaded = 0;

      for (const path of paths.slice(0, maxFiles)) {
        if (totalSize >= maxSize || filesLoaded >= maxFiles) break;

        try {
          const result = await SandboxService.readFile(projectId, userId, path);

          if (result.status === "success" && result.content) {
            const size = result.content.length;

            if (totalSize + size <= maxSize) {
              loadedFiles[path] = result.content;
              totalSize += size;
              filesLoaded++;
            }
          }
        } catch (error) {
          logger.warn(`Failed to load file: ${path}`, error as any);
        }
      }

      return {
        success: true,
        data: {
          files: loadedFiles,
          filesLoaded,
          totalSize,
          truncated: paths.length > filesLoaded,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "File loading failed",
      };
    }
  }

  /**
   * Load project dependencies
   */
  private async loadDependencies(
    projectId: string,
    userId: string
  ): Promise<ToolResult> {
    try {
      // Try to read package.json
      const pkgResult = await SandboxService.readFile(
        projectId,
        userId,
        "package.json"
      );

      if (pkgResult.status === "error") {
        return {
          success: true,
          data: {
            dependencies: { packages: [], devPackages: [] },
            message: "No package.json found",
          },
        };
      }

      const pkg = JSON.parse(pkgResult.content || "{}");

      const dependencies = {
        packages: Object.entries(pkg.dependencies || {}).map(
          ([name, version]) => ({
            name,
            version: version as string,
          })
        ),
        devPackages: Object.entries(pkg.devDependencies || {}).map(
          ([name, version]) => ({
            name,
            version: version as string,
          })
        ),
      };

      return {
        success: true,
        data: {
          dependencies,
          totalPackages:
            dependencies.packages.length + dependencies.devPackages.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Dependency loading failed",
      };
    }
  }

  /**
   * Load project configuration files
   */
  private async loadConfiguration(
    projectId: string,
    userId: string
  ): Promise<ToolResult> {
    try {
      const config: any = {};

      // Load package.json
      const pkgResult = await SandboxService.readFile(
        projectId,
        userId,
        "package.json"
      );
      if (pkgResult.status === "success") {
        config.packageJson = JSON.parse(pkgResult.content || "{}");
      }

      // Load tsconfig.json
      const tsconfigResult = await SandboxService.readFile(
        projectId,
        userId,
        "tsconfig.json"
      );
      if (tsconfigResult.status === "success") {
        config.tsconfig = JSON.parse(tsconfigResult.content || "{}");
      }

      // Load .eslintrc
      const eslintResult = await SandboxService.readFile(
        projectId,
        userId,
        ".eslintrc.json"
      );
      if (eslintResult.status === "success") {
        config.eslintrc = JSON.parse(eslintResult.content || "{}");
      }

      // Load .gitignore
      const gitignoreResult = await SandboxService.readFile(
        projectId,
        userId,
        ".gitignore"
      );
      if (gitignoreResult.status === "success") {
        config.gitignore = gitignoreResult.content
          ?.split("\n")
          .filter((line) => line && !line.startsWith("#"));
      }

      return {
        success: true,
        data: { configuration: config },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Configuration loading failed",
      };
    }
  }

  /**
   * Smart load - Intelligently load relevant files based on task
   */
  private async smartLoad(
    projectId: string,
    userId: string,
    taskDescription?: string,
    maxFiles: number = 50,
    maxSize: number = 1048576 // 1MB
  ): Promise<ToolResult> {
    try {
      // Step 1: Scan structure
      const structureResult = await this.scanStructure(projectId, userId);
      if (!structureResult.success) {
        return structureResult;
      }

      const allFiles =
        structureResult.data?.structure?.files?.map((f: any) => f.path) || [];

      // Step 2: Determine relevant files based on task
      const relevantFiles = this.selectRelevantFiles(
        allFiles,
        taskDescription,
        maxFiles
      );

      // Step 3: Load relevant files
      const filesResult = await this.loadFiles(
        projectId,
        userId,
        relevantFiles,
        maxFiles,
        maxSize
      );

      // Step 4: Load dependencies
      const depsResult = await this.loadDependencies(projectId, userId);

      // Step 5: Load configuration
      const configResult = await this.loadConfiguration(projectId, userId);

      return {
        success: true,
        data: {
          structure: structureResult.data?.structure,
          existingFiles: filesResult.data?.files || {},
          dependencies: depsResult.data?.dependencies,
          configuration: configResult.data?.configuration,
          relevantFiles,
          filesLoaded: filesResult.data?.filesLoaded || 0,
          totalSize: filesResult.data?.totalSize || 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Smart load failed",
      };
    }
  }

  /**
   * Select relevant files based on task description
   */
  private selectRelevantFiles(
    allFiles: string[],
    taskDescription?: string,
    maxFiles: number = 50
  ): string[] {
    if (!taskDescription) {
      // Default: load common important files
      return allFiles
        .filter(
          (f) =>
            f.includes("package.json") ||
            f.includes("tsconfig.json") ||
            f.includes("README") ||
            f.match(/src\/(app|lib|components)\/.*\.(ts|tsx|js|jsx)$/)
        )
        .slice(0, maxFiles);
    }

    const keywords = taskDescription.toLowerCase().split(" ");
    const scored: Array<{ path: string; score: number }> = [];

    for (const file of allFiles) {
      let score = 0;
      const fileLower = file.toLowerCase();

      // Score based on keyword matches
      for (const keyword of keywords) {
        if (fileLower.includes(keyword)) score += 5;
      }

      // Priority files
      if (fileLower.includes("api")) score += 3;
      if (fileLower.includes("component")) score += 3;
      if (fileLower.includes("model")) score += 3;
      if (fileLower.includes("service")) score += 3;
      if (fileLower.includes("util")) score += 2;
      if (fileLower.includes("type")) score += 2;

      // File type priority
      if (fileLower.endsWith(".ts") || fileLower.endsWith(".tsx")) score += 2;
      if (fileLower.endsWith(".json")) score += 1;

      // De-prioritize test files (unless task mentions testing)
      if (
        fileLower.includes("test") &&
        !taskDescription.toLowerCase().includes("test")
      ) {
        score -= 3;
      }

      if (score > 0) {
        scored.push({ path: file, score });
      }
    }

    // Sort by score and return top files
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxFiles)
      .map((item) => item.path);
  }

  /**
   * Get file type from extension
   */
  private getFileType(ext: string): string {
    const typeMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      json: "config",
      md: "documentation",
      css: "style",
      scss: "style",
      html: "markup",
      py: "python",
      go: "go",
      rs: "rust",
      java: "java",
      cs: "csharp",
      php: "php",
    };

    return typeMap[ext] || "other";
  }

  /**
   * Group files by type
   */
  private groupFilesByType(files: Array<{ path: string; type: string }>) {
    const groups: Record<string, number> = {};

    for (const file of files) {
      groups[file.type] = (groups[file.type] || 0) + 1;
    }

    return groups;
  }

  protected getExamples(): string[] {
    return [
      '// Scan project structure\n{ "operation": "scan_structure" }',
      '// Load specific files\n{ "operation": "load_files", "paths": ["src/app/page.tsx", "src/lib/utils.ts"] }',
      '// Load dependencies\n{ "operation": "load_dependencies" }',
      '// Smart load relevant files\n{ "operation": "smart_load", "taskDescription": "Create user authentication API", "maxFiles": 15 }',
      '// Load configuration files\n{ "operation": "load_config" }',
    ];
  }
}
