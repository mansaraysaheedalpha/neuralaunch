// src/lib/agents/research/research.agent.ts
/**
 * Research Agent
 * Researches tech stack recommendations and best practices for features
 */

import { type ParsedBlueprint } from "@/lib/parsers/blueprint-parser";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { createThoughtStream } from "@/lib/agents/thought-stream";

export interface TechRecommendation {
  category:
    | "frontend"
    | "backend"
    | "database"
    | "infrastructure"
    | "integration";
  name: string;
  rationale: string;
  alternatives: string[];
  bestPractices: string[];
}

export interface ResearchInput {
  projectId: string;
  userId: string;
  conversationId: string;
}

export interface ResearchOutput {
  success: boolean;
  recommendations: TechRecommendation[];
  architecturePattern: string;
  message: string;
}

/**
 * Research Agent - AI-Powered Technology Research
 *
 * CAPABILITIES:
 * ✅ AI-Driven Tech Stack Research - Uses advanced AI to analyze project requirements
 * ✅ Best Practices Discovery - Researches modern development patterns
 * ✅ Technology Recommendations - Suggests optimal frameworks and tools
 * ✅ Alternative Analysis - Provides alternatives for each technology choice
 *
 * This agent ensures technology choices are:
 * - Modern and well-maintained
 * - Compatible with project requirements
 * - Based on industry best practices
 * - Suitable for the team's skill level
 */
export class ResearchAgent {
  name = "Research";
  description = "Researches best practices and recommends tech stack";

  async execute(input: ResearchInput): Promise<ResearchOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting research for project ${input.projectId}`
    );

    // Create thought stream
    const thoughts = createThoughtStream(input.projectId, this.name);

    try {
      await thoughts.starting("technology research and analysis");
      
      // Step 1: Get parsed blueprint from ProjectContext
      await thoughts.accessing("ProjectContext database", "Retrieving analyzed blueprint");
      const context = await prisma.projectContext.findUnique({
        where: { projectId: input.projectId },
      });

      if (!context?.blueprint) {
        await thoughts.error("No parsed blueprint found - Analyzer must run first");
        throw new Error("No parsed blueprint found. Run Analyzer first.");
      }

     const blueprintData = context.blueprint as any;
     const parsed = blueprintData.parsed || blueprintData;
     
     await thoughts.analyzing("project requirements", { 
       projectName: parsed.projectName,
       features: parsed.features?.length || 0,
     });
     logger.info(`[${this.name}] Retrieved blueprint: ${parsed.projectName}`);

      // Step 2: Research tech stack
      await thoughts.thinking("optimal technology stack for project requirements");
      logger.info(`[${this.name}] Researching optimal tech stack...`);
      
      await thoughts.accessing("AI Tech Researcher", "Consulting AI for technology recommendations");
      const recommendations = await this.researchTechStack(parsed, thoughts);

      // Step 3: Determine architecture pattern
      await thoughts.deciding("best architecture pattern for this project");
      const architecturePattern = this.determineArchitecturePattern(parsed);
      await thoughts.emit("deciding", `Selected ${architecturePattern} architecture`, {
        pattern: architecturePattern,
      });

      // Step 4: Store in database
      await thoughts.accessing("database", "Storing research recommendations");
      await this.storeInDatabase(
        input.projectId,
        recommendations,
        architecturePattern
      );

      // Step 5: Log execution
      const duration = Date.now() - startTime;
      await thoughts.executing("logging research results");
      await this.logExecution(
        input.projectId,
        parsed,
        recommendations,
        true,
        duration
      );

      await thoughts.completing(`Research complete with ${recommendations.length} technology recommendations in ${duration}ms`);
      logger.info(`[${this.name}] Research complete in ${duration}ms`);

      return {
        success: true,
        recommendations,
        architecturePattern,
        message: `Successfully researched tech stack with ${recommendations.length} recommendations.`,
      };
    } catch (error) {
      await thoughts.error(
        error instanceof Error ? error.message : "Unknown error during research",
        { error: error instanceof Error ? error.stack : String(error) }
      );
      
      logger.error(
        `[${this.name}] Research failed:`,
        error instanceof Error ? error : undefined
      );
      await this.logExecution(
        input.projectId,
        null,
        [],
        false,
        Date.now() - startTime,
        error
      );
      throw error;
    }
  }

  /**
   * Research optimal tech stack using AI
   */
  private async researchTechStack(
    parsed: ParsedBlueprint,
    thoughts?: ReturnType<typeof createThoughtStream>
  ): Promise<TechRecommendation[]> {
    const prompt = this.buildResearchPrompt(parsed);

    if (thoughts) {
      await thoughts.thinking("building research prompt for AI");
      await thoughts.executing("querying AI for tech stack recommendations");
    }

    const response = await executeAITaskSimple(
      AITaskType.AGENT_TECH_RESEARCHER,
      {
        prompt,
        responseFormat: { type: "json_object" },
      }
    );

    // Parse AI response
    if (thoughts) {
      await thoughts.analyzing("AI response and extracting recommendations");
    }
    
    const cleaned = this.cleanJsonResponse(response);
    const result = JSON.parse(cleaned);

    return result.recommendations || [];
  }

  /**
   * Build research prompt for AI
   */
  private buildResearchPrompt(parsed: ParsedBlueprint): string {
    return `You are a Senior Tech Stack Researcher analyzing a startup blueprint.

PROJECT: ${parsed.projectName}
INDUSTRY: ${parsed.industry || "Unknown"}
PROJECT TYPE: ${parsed.projectType || "Web Application"}

FEATURES TO BUILD:
${parsed.features.map((f, i) => `${i + 1}. ${f.name} (${f.priority}, ${f.complexity})`).join("\n")}

CURRENT TECH MENTIONS:
${parsed.techStack.map((t) => `- ${t.name} (${t.category})`).join("\n")}

YOUR TASK:
Research and recommend the OPTIMAL modern tech stack for this project.

RULES:
1. Prioritize technologies mentioned in the blueprint
2. Fill gaps with best-in-class modern tools
3. Consider feature complexity and requirements
4. Ensure all choices are compatible
5. Focus on developer experience and maintainability

OUTPUT FORMAT (JSON):
{
  "recommendations": [
    {
      "category": "frontend",
      "name": "Next.js 14",
      "rationale": "Server components + app router perfect for modern SaaS",
      "alternatives": ["Remix", "SvelteKit"],
      "bestPractices": [
        "Use server components for data fetching",
        "Implement parallel routes for dashboards",
        "Enable Edge runtime for API routes"
      ]
    },
    {
      "category": "backend",
      "name": "Supabase",
      "rationale": "PostgreSQL + Auth + Realtime out of the box",
      "alternatives": ["Firebase", "AWS Amplify"],
      "bestPractices": [
        "Use Row Level Security for multi-tenancy",
        "Enable realtime subscriptions for live features",
        "Use Supabase Edge Functions for serverless logic"
      ]
    }
  ]
}

IMPORTANT: 
- Respond with ONLY valid JSON
- Include frontend, backend, database, and any needed integrations
- Each recommendation needs rationale, alternatives, and best practices`;
  }

  /**
   * Determine architecture pattern based on project type
   */
  private determineArchitecturePattern(parsed: ParsedBlueprint): string {
    const features = parsed.features.length;
    const complexity = parsed.features.filter(
      (f) => f.complexity === "high"
    ).length;

    // Simple heuristics
    if (features <= 5 && complexity === 0) {
      return "monolithic";
    } else if (features > 10 || complexity > 3) {
      return "microservices";
    } else {
      return "modular-monolith";
    }
  }

  /**
   * Store research results in database
   */
  private async storeInDatabase(
    projectId: string,
    recommendations: TechRecommendation[],
    architecturePattern: string
  ): Promise<void> {
    try {
      await prisma.projectContext.update({
        where: { projectId },
        data: {
          techStack: {
            recommendations,
            architecturePattern,
            researchedAt: new Date(),
          } as any,
          currentPhase: "validation",
          updatedAt: new Date(),
        },
      });

      logger.info(
        `[${this.name}] Stored tech stack recommendations for ${projectId}`
      );
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to store in database:`,
        error instanceof Error ? error : undefined
      );
      throw new Error(
        `Database storage failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Log execution for monitoring
   */
  private async logExecution(
    projectId: string,
    parsed: ParsedBlueprint | null,
    recommendations: TechRecommendation[],
    success: boolean,
    durationMs: number,
    error?: unknown
  ): Promise<void> {
    try {
      await prisma.agentExecution.create({
        data: {
          projectId,
          agentName: this.name,
          phase: "research",
          input: parsed
            ? ({
                projectName: parsed.projectName,
                featureCount: parsed.features.length,
                existingTech: parsed.techStack.length,
              } as any)
            : {},
          output: {
            recommendationCount: recommendations.length,
            categories: [...new Set(recommendations.map((r) => r.category))],
          } as any,
          success,
          durationMs,
          error: error
            ? error instanceof Error
              ? error.message
              : String(error)
            : null,
        },
      });
    } catch (logError) {
      logger.error(
        `[${this.name}] Failed to log execution:`,
        logError instanceof Error ? logError : undefined
      );
    }
  }

  /**
   * Clean JSON response from AI (remove markdown fences)
   */
  private cleanJsonResponse(text: string): string {
    // Remove markdown code blocks
    let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");

    // Find JSON object
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end !== -1) {
      cleaned = cleaned.substring(start, end + 1);
    }

    return cleaned.trim();
  }
}

// Export singleton instance
export const researchAgent = new ResearchAgent();
