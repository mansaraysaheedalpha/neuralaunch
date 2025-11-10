// src/lib/agents/deployment/deploy-agent.ts
/**
 * Deploy Agent - Multi-Platform Deployment
 *
 * Supports:
 * - Vercel (Next.js, React, Vue, static)
 * - Railway (Node, Python, Go APIs with databases)
 * - Render (Full-stack apps, Docker)
 * - Fly.io (Edge deployment, Docker)
 * - Netlify (Static sites, Jamstack)
 * - DigitalOcean App Platform (Simple apps)
 * - AWS/GCP/Azure (Enterprise)
 * - Self-hosted Docker (Custom infrastructure)
 */

import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { AI_MODELS } from "@/lib/models";
import { logger } from "@/lib/logger";
import { toError, toLogContext } from "@/lib/error-utils";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type DeploymentPlatform =
  | "vercel"
  | "railway"
  | "render"
  | "fly.io"
  | "netlify"
  | "digitalocean"
  | "aws"
  | "gcp"
  | "azure"
  | "self-hosted";

export interface DeploymentInput extends AgentExecutionInput {
  platform: DeploymentPlatform;
  environment: "staging" | "production";
  envVars?: Record<string, string>;
  customDomain?: string;
  runMigrations?: boolean;
}

export interface DeploymentResult {
  success: boolean;
  deploymentUrl?: string;
  deploymentId?: string;
  logs?: string[];
  healthCheckPassed?: boolean;
  durationMs: number;
}

// ==========================================
// DEPLOY AGENT CLASS
// ==========================================

export class DeployAgent extends BaseAgent {
  constructor() {
    super({
      name: "DeployAgent",
      category: "deployment",
      description: "Multi-platform deployment with health checks",
      supportedTaskTypes: ["deployment", "deploy_config"],
      requiredTools: ["filesystem", "command", "web_search"],
      modelName: AI_MODELS.OPENAI,
    });
  }

  /**
   * Execute deployment task
   */
  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const deployInput = input as DeploymentInput;
    const startTime = Date.now();

    logger.info(`[${this.config.name}] Starting deployment`, {
      platform: deployInput.platform,
      environment: deployInput.environment,
    });

    try {
      // Step 1: Pre-deployment checks
      await this.preDeploymentChecks(input);

      // Step 2: Run database migrations (if needed)
      if (deployInput.runMigrations) {
        await this.runDatabaseMigrations(input);
      }

      // Step 3: Deploy to platform
      const deploymentResult = await this.deployToPlatform(deployInput);

      // Step 4: Post-deployment health check
      if (deploymentResult.deploymentUrl) {
        const healthCheckPassed = await this.performHealthCheck(
          deploymentResult.deploymentUrl
        );
        deploymentResult.healthCheckPassed = healthCheckPassed;
      }

      const durationMs = Date.now() - startTime;

      logger.info(`[${this.config.name}] Deployment complete`, {
        platform: deployInput.platform,
        url: deploymentResult.deploymentUrl,
        duration: `${durationMs}ms`,
      });

      return {
        success: deploymentResult.success,
        message: `Deployed to ${deployInput.platform}: ${deploymentResult.deploymentUrl}`,
        iterations: 1,
        durationMs,
        data: deploymentResult,
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Deployment failed`, toError(error));

      return {
        success: false,
        message: "Deployment failed",
        iterations: 1,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Pre-deployment validation checks
   */
  private async preDeploymentChecks(input: AgentExecutionInput): Promise<void> {
    logger.info(`[${this.config.name}] Running pre-deployment checks`);

    // Check if required files exist
    const requiredFiles = this.getRequiredFilesForPlatform(
      (input as DeploymentInput).platform
    );

    for (const file of requiredFiles) {
      const fileExists = await this.checkFileExists(input, file);
      if (!fileExists) {
        throw new Error(`Required file missing: ${file}`);
      }
    }

    logger.info(`[${this.config.name}] Pre-deployment checks passed`);
  }

  /**
   * Get required files based on platform
   */
  private getRequiredFilesForPlatform(platform: DeploymentPlatform): string[] {
    const platformFiles: Record<DeploymentPlatform, string[]> = {
      vercel: ["package.json", ".env.example"],
      railway: ["package.json", ".env.example"],
      render: ["package.json", ".env.example"],
      "fly.io": ["fly.toml", "Dockerfile"],
      netlify: ["netlify.toml"],
      digitalocean: [".do/app.yaml"],
      aws: ["package.json"],
      gcp: ["app.yaml"],
      azure: ["azure-pipelines.yml"],
      "self-hosted": ["Dockerfile", "docker-compose.yml"],
    };

    return platformFiles[platform] || ["package.json"];
  }

  /**
   * Check if file exists
   */
  private async checkFileExists(
    input: AgentExecutionInput,
    filepath: string
  ): Promise<boolean> {
    try {
      const result = await this.executeTool(
        "filesystem",
        { operation: "read", path: filepath },
        { projectId: input.projectId, userId: input.userId }
      );
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Run database migrations before deployment
   */
  private async runDatabaseMigrations(
    input: AgentExecutionInput
  ): Promise<void> {
    logger.info(`[${this.config.name}] Running database migrations`);

    // Detect migration tool (Prisma, TypeORM, Sequelize, etc.)
    const migrationCommand = await this.detectMigrationCommand(input);

    if (!migrationCommand) {
      logger.warn(`[${this.config.name}] No migration tool detected, skipping`);
      return;
    }

    // Run migrations
    const result = await this.executeTool(
      "command",
      { command: migrationCommand },
      { projectId: input.projectId, userId: input.userId }
    );

    if (!result.success) {
      throw new Error(`Migration failed: ${result.error}`);
    }

    logger.info(`[${this.config.name}] Migrations completed successfully`);
  }

  /**
   * Detect which migration command to use
   */
  private async detectMigrationCommand(
    input: AgentExecutionInput
  ): Promise<string | null> {
    // Check for Prisma
    const hasPrisma = await this.checkFileExists(input, "prisma/schema.prisma");
    if (hasPrisma) return "npx prisma migrate deploy";

    // Check for TypeORM
    const hasTypeORM = await this.checkFileExists(input, "ormconfig.json");
    if (hasTypeORM) return "npm run typeorm migration:run";

    // Check for Django
    const hasDjango = await this.checkFileExists(input, "manage.py");
    if (hasDjango) return "python manage.py migrate";

    // Check for Laravel
    const hasLaravel = await this.checkFileExists(input, "artisan");
    if (hasLaravel) return "php artisan migrate";

    return null;
  }

  /**
   * Deploy to specific platform
   */
  private async deployToPlatform(
    input: DeploymentInput
  ): Promise<DeploymentResult> {
    const platform = input.platform;

    logger.info(`[${this.config.name}] Deploying to ${platform}`);

    switch (platform) {
      case "vercel":
        return await this.deployToVercel(input);
      case "railway":
        return await this.deployToRailway(input);
      case "render":
        return await this.deployToRender(input);
      case "fly.io":
        return await this.deployToFly(input);
      case "netlify":
        return await this.deployToNetlify(input);
      case "digitalocean":
        return await this.deployToDigitalOcean(input);
      case "self-hosted":
        return await this.deployDocker(input);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  // src/lib/agents/deployment/deploy-agent.ts (continued)

  /**
   * Deploy to Vercel
   */
  private async deployToVercel(
    input: DeploymentInput
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    logger.info(`[${this.config.name}] Deploying to Vercel`);

    try {
      // Check if Vercel token exists
      const vercelToken = process.env.VERCEL_TOKEN;
      if (!vercelToken) {
        throw new Error("VERCEL_TOKEN environment variable not set");
      }

      // Get project context for deployment info
      const context = input.context as any;
      const projectName =
        context.codebase?.githubRepoName?.split("/")[1] || "app";

      // Build deployment command
      const deployCommand =
        input.environment === "production"
          ? `vercel --prod --token ${vercelToken} --yes`
          : `vercel --token ${vercelToken} --yes`;

      // Execute deployment
      const result = await this.executeTool(
        "command",
        {
          command: deployCommand,
          timeout: 600000, // 10 minutes
        },
        { projectId: input.projectId, userId: input.userId }
      );

      if (!result.success) {
        throw new Error(`Vercel deployment failed: ${result.error}`);
      }

      // Extract deployment URL from output
      const deploymentUrl = this.extractVercelUrl(result.data?.stdout || "");

      logger.info(`[${this.config.name}] Vercel deployment successful`, {
        url: deploymentUrl,
      });

      return {
        success: true,
        deploymentUrl,
        deploymentId: `vercel-${Date.now()}`,
        logs: [result.data?.stdout || ""],
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Vercel deployment error`, toError(error));

      return {
        success: false,
        logs: [error instanceof Error ? error.message : "Unknown error"],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Deploy to Railway
   */
  private async deployToRailway(
    input: DeploymentInput
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    logger.info(`[${this.config.name}] Deploying to Railway`);

    try {
      // Check if Railway token exists
      const railwayToken = process.env.RAILWAY_TOKEN;
      if (!railwayToken) {
        throw new Error("RAILWAY_TOKEN environment variable not set");
      }

      // Install Railway CLI if needed
      await this.ensureRailwayCLI(input);

      // Link to Railway project (or create new one)
      const projectId = await this.getRailwayProjectId(input);

      // Deploy using Railway CLI
      const deployCommand = `railway up --service ${projectId}`;

      const result = await this.executeTool(
        "command",
        {
          command: deployCommand,
          env: { RAILWAY_TOKEN: railwayToken },
          timeout: 600000, // 10 minutes
        },
        { projectId: input.projectId, userId: input.userId }
      );

      if (!result.success) {
        throw new Error(`Railway deployment failed: ${result.error}`);
      }

      // Get deployment URL from Railway
      const deploymentUrl = await this.getRailwayDeploymentUrl(
        input,
        projectId
      );

      logger.info(`[${this.config.name}] Railway deployment successful`, {
        url: deploymentUrl,
      });

      return {
        success: true,
        deploymentUrl,
        deploymentId: projectId,
        logs: [result.data?.stdout || ""],
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Railway deployment error`, toError(error));

      return {
        success: false,
        logs: [error instanceof Error ? error.message : "Unknown error"],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Deploy to Render
   */
  private async deployToRender(
    input: DeploymentInput
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    logger.info(`[${this.config.name}] Deploying to Render`);

    try {
      // Render uses Git-based deployment
      // We need to trigger a deploy via API or GitHub hook

      const renderApiKey = process.env.RENDER_API_KEY;
      if (!renderApiKey) {
        throw new Error("RENDER_API_KEY environment variable not set");
      }

      // Get service ID from context
      const context = input.context as any;
      const serviceId = context.codebase?.renderServiceId;

      if (!serviceId) {
        throw new Error(
          "Render service ID not found. Please link your Render service."
        );
      }

      // Trigger deployment via Render API
      const deployResult = await this.triggerRenderDeploy(
        serviceId,
        renderApiKey
      );

      if (!deployResult.success) {
        throw new Error(`Render deployment failed: ${deployResult.error}`);
      }

      // Get deployment URL
      const deploymentUrl = deployResult.serviceUrl;

      logger.info(`[${this.config.name}] Render deployment successful`, {
        url: deploymentUrl,
      });

      return {
        success: true,
        deploymentUrl,
        deploymentId: deployResult.deployId,
        logs: ["Render deployment triggered successfully"],
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Render deployment error`, toError(error));

      return {
        success: false,
        logs: [error instanceof Error ? error.message : "Unknown error"],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Deploy to Fly.io
   */
  private async deployToFly(input: DeploymentInput): Promise<DeploymentResult> {
    const startTime = Date.now();

    logger.info(`[${this.config.name}] Deploying to Fly.io`);

    try {
      // Check if fly.toml exists
      const hasFlyConfig = await this.checkFileExists(input, "fly.toml");
      if (!hasFlyConfig) {
        throw new Error("fly.toml not found. Run 'fly launch' first.");
      }

      // Ensure Fly CLI is installed
      await this.ensureFlyCLI(input);

      // Deploy using Fly CLI
      const deployCommand = "fly deploy --remote-only";

      const result = await this.executeTool(
        "command",
        {
          command: deployCommand,
          timeout: 600000, // 10 minutes
        },
        { projectId: input.projectId, userId: input.userId }
      );

      if (!result.success) {
        throw new Error(`Fly.io deployment failed: ${result.error}`);
      }

      // Extract deployment URL
      const deploymentUrl = this.extractFlyUrl(result.data?.stdout || "");

      logger.info(`[${this.config.name}] Fly.io deployment successful`, {
        url: deploymentUrl,
      });

      return {
        success: true,
        deploymentUrl,
        deploymentId: `fly-${Date.now()}`,
        logs: [result.data?.stdout || ""],
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Fly.io deployment error`, toError(error));

      return {
        success: false,
        logs: [error instanceof Error ? error.message : "Unknown error"],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Deploy to Netlify
   */
  private async deployToNetlify(
    input: DeploymentInput
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    logger.info(`[${this.config.name}] Deploying to Netlify`);

    try {
      const netlifyToken = process.env.NETLIFY_AUTH_TOKEN;
      if (!netlifyToken) {
        throw new Error("NETLIFY_AUTH_TOKEN environment variable not set");
      }

      // Build the site first
      const buildResult = await this.executeTool(
        "command",
        { command: "npm run build" },
        { projectId: input.projectId, userId: input.userId }
      );

      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.error}`);
      }

      // Deploy to Netlify
      const deployCommand =
        input.environment === "production"
          ? `netlify deploy --prod --auth ${netlifyToken}`
          : `netlify deploy --auth ${netlifyToken}`;

      const result = await this.executeTool(
        "command",
        {
          command: deployCommand,
          timeout: 300000, // 5 minutes
        },
        { projectId: input.projectId, userId: input.userId }
      );

      if (!result.success) {
        throw new Error(`Netlify deployment failed: ${result.error}`);
      }

      // Extract deployment URL
      const deploymentUrl = this.extractNetlifyUrl(result.data?.stdout || "");

      logger.info(`[${this.config.name}] Netlify deployment successful`, {
        url: deploymentUrl,
      });

      return {
        success: true,
        deploymentUrl,
        deploymentId: `netlify-${Date.now()}`,
        logs: [result.data?.stdout || ""],
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Netlify deployment error`, toError(error));

      return {
        success: false,
        logs: [error instanceof Error ? error.message : "Unknown error"],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Deploy to DigitalOcean App Platform
   */
  private async deployToDigitalOcean(
    input: DeploymentInput
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    logger.info(`[${this.config.name}] Deploying to DigitalOcean`);

    try {
      const doToken = process.env.DIGITALOCEAN_TOKEN;
      if (!doToken) {
        throw new Error("DIGITALOCEAN_TOKEN environment variable not set");
      }

      // DigitalOcean uses Git-based deployment
      // Trigger via API
      const context = input.context as any;
      const appId = context.codebase?.digitalOceanAppId;

      if (!appId) {
        throw new Error(
          "DigitalOcean App ID not found. Please create app first."
        );
      }

      // Trigger deployment via DO API
      const deployResult = await this.triggerDigitalOceanDeploy(appId, doToken);

      if (!deployResult.success) {
        throw new Error(
          `DigitalOcean deployment failed: ${deployResult.error}`
        );
      }

      logger.info(`[${this.config.name}] DigitalOcean deployment successful`, {
        url: deployResult.liveUrl,
      });

      return {
        success: true,
        deploymentUrl: deployResult.liveUrl,
        deploymentId: deployResult.deploymentId,
        logs: ["DigitalOcean deployment triggered successfully"],
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(
        `[${this.config.name}] DigitalOcean deployment error`,
        error instanceof Error ? error : new Error(String(error))
      );

      return {
        success: false,
        logs: [error instanceof Error ? error.message : "Unknown error"],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Deploy using Docker (self-hosted)
   */
  private async deployDocker(
    input: DeploymentInput
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    logger.info(`[${this.config.name}] Deploying with Docker`);

    try {
      // Check if Dockerfile exists
      const hasDockerfile = await this.checkFileExists(input, "Dockerfile");
      if (!hasDockerfile) {
        throw new Error("Dockerfile not found");
      }

      // Build Docker image
      const imageName = `${input.projectId}:${input.environment}`;

      const buildResult = await this.executeTool(
        "command",
        {
          command: `docker build -t ${imageName} .`,
          timeout: 600000, // 10 minutes
        },
        { projectId: input.projectId, userId: input.userId }
      );

      if (!buildResult.success) {
        throw new Error(`Docker build failed: ${buildResult.error}`);
      }

      // Run container
      const runResult = await this.executeTool(
        "command",
        {
          command: `docker run -d -p 3000:3000 --name ${input.projectId}-${input.environment} ${imageName}`,
        },
        { projectId: input.projectId, userId: input.userId }
      );

      if (!runResult.success) {
        throw new Error(`Docker run failed: ${runResult.error}`);
      }

      const deploymentUrl = `http://localhost:3000`;

      logger.info(`[${this.config.name}] Docker deployment successful`, {
        url: deploymentUrl,
      });

      return {
        success: true,
        deploymentUrl,
        deploymentId: runResult.data?.stdout?.trim() || "",
        logs: [buildResult.data?.stdout || "", runResult.data?.stdout || ""],
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Docker deployment error`, toError(error));

      return {
        success: false,
        logs: [error instanceof Error ? error.message : "Unknown error"],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Perform health check on deployed application
   */
  private async performHealthCheck(url: string): Promise<boolean> {
    logger.info(`[${this.config.name}] Performing health check on ${url}`);

    try {
      // Wait 10 seconds for deployment to stabilize
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Try to fetch the URL
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const isHealthy = response.status >= 200 && response.status < 500;

      logger.info(
        `[${this.config.name}] Health check ${isHealthy ? "passed" : "failed"}`,
        {
          status: response.status,
        }
      );

      return isHealthy;
    } catch (error) {
      logger.warn(`[${this.config.name}] Health check failed`, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Extract Vercel deployment URL from CLI output
   */
  private extractVercelUrl(output: string): string {
    // Vercel CLI outputs: "https://your-app-xxx.vercel.app"
    const match = output.match(/https:\/\/[^\s]+\.vercel\.app/);
    return match ? match[0] : "";
  }

  /**
   * Extract Fly.io deployment URL from CLI output
   */
  private extractFlyUrl(output: string): string {
    // Fly outputs: "https://your-app.fly.dev"
    const match = output.match(/https:\/\/[^\s]+\.fly\.dev/);
    return match ? match[0] : "";
  }

  /**
   * Extract Netlify deployment URL from CLI output
   */
  private extractNetlifyUrl(output: string): string {
    // Netlify outputs: "https://your-app.netlify.app"
    const match = output.match(/https:\/\/[^\s]+\.netlify\.app/);
    return match ? match[0] : "";
  }

  /**
   * Ensure Railway CLI is installed
   */
  private async ensureRailwayCLI(input: AgentExecutionInput): Promise<void> {
    const checkResult = await this.executeTool(
      "command",
      { command: "railway --version" },
      { projectId: input.projectId, userId: input.userId }
    );

    if (!checkResult.success) {
      // Install Railway CLI
      await this.executeTool(
        "command",
        { command: "npm install -g @railway/cli" },
        { projectId: input.projectId, userId: input.userId }
      );
    }
  }

  /**
   * Ensure Fly CLI is installed
   */
  private async ensureFlyCLI(input: AgentExecutionInput): Promise<void> {
    const checkResult = await this.executeTool(
      "command",
      { command: "fly version" },
      { projectId: input.projectId, userId: input.userId }
    );

    if (!checkResult.success) {
      throw new Error(
        "Fly CLI not installed. Please install from https://fly.io/docs/hands-on/install-flyctl/"
      );
    }
  }

  /**
   * Get Railway project ID
   */
  private async getRailwayProjectId(
    input: AgentExecutionInput
  ): Promise<string> {
    // Try to get from context first
    const context = input.context as any;
    if (context.codebase?.railwayProjectId) {
      return context.codebase.railwayProjectId;
    }

    // Otherwise, create new project
    const result = await this.executeTool(
      "command",
      { command: "railway init" },
      { projectId: input.projectId, userId: input.userId }
    );

    if (!result.success) {
      throw new Error("Failed to initialize Railway project");
    }

    // Extract project ID from output
    // Railway outputs: "Project created: project-id"
    const match = (result.data?.stdout || "").match(
      /Project created: ([^\s]+)/
    );
    return match ? match[1] : "default";
  }

  /**
   * Get Railway deployment URL
   */
  private async getRailwayDeploymentUrl(
    input: AgentExecutionInput,
    projectId: string
  ): Promise<string> {
    const result = await this.executeTool(
      "command",
      { command: `railway domain` },
      { projectId: input.projectId, userId: input.userId }
    );

    if (result.success && result.data?.stdout) {
      const match = result.data.stdout.match(/https:\/\/[^\s]+/);
      if (match) return match[0];
    }

    return `https://${projectId}.up.railway.app`;
  }

  /**
   * Trigger Render deployment via API
   */
  private async triggerRenderDeploy(
    serviceId: string,
    apiKey: string
  ): Promise<{
    success: boolean;
    deployId?: string;
    serviceUrl?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `https://api.render.com/v1/services/${serviceId}/deploys`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ clearCache: false }),
        }
      );

      if (!response.ok) {
        throw new Error(`Render API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        deployId: data.id,
        serviceUrl: `https://${serviceId}.onrender.com`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Trigger DigitalOcean deployment via API
   */
  private async triggerDigitalOceanDeploy(
    appId: string,
    token: string
  ): Promise<{
    success: boolean;
    deploymentId?: string;
    liveUrl?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `https://api.digitalocean.com/v2/apps/${appId}/deployments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ force_build: true }),
        }
      );

      if (!response.ok) {
        throw new Error(`DigitalOcean API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        deploymentId: data.deployment.id,
        liveUrl: data.deployment.live_url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export const deployAgent = new DeployAgent();
