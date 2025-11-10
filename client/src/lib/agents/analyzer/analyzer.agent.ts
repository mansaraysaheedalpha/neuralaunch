// src/lib/agents/analyzer/analyzer.agent.ts
/**
 * Analyzer Agent
 * Parses blueprints and extracts structured information for the agent system
 */

import {
  parseBlueprint,
  getBlueprintStats,
  validateParsedBlueprint,
  type ParsedBlueprint,
} from "@/lib/parsers/blueprint-parser";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface AnalyzerInput {
  blueprint: string;
  conversationId: string;
  userId: string;
  projectId?: string;
}

export interface AnalyzerOutput {
  success: boolean;
  projectId: string;
  parsed: ParsedBlueprint;
  stats: ReturnType<typeof getBlueprintStats>;
  validation: ReturnType<typeof validateParsedBlueprint>;
  message: string;
}

export class AnalyzerAgent {
  name = "Analyzer";
  description = "Parses blueprints and extracts structured information";

  async execute(input: AnalyzerInput): Promise<AnalyzerOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting analysis for conversation ${input.conversationId}`
    );

    try {
      // Step 1: Parse the blueprint
      logger.info(`[${this.name}] Parsing blueprint...`);
      const parsed = parseBlueprint(input.blueprint);

      // Step 2: Get stats and validation
      const stats = getBlueprintStats(parsed);
      const validation = validateParsedBlueprint(parsed);

      logger.info(
        `[${this.name}] Parsed ${stats.featureCount} features, ${stats.techCount} technologies`
      );

      if (!validation.valid) {
        logger.warn(`[${this.name}] Validation issues:`, { errors: validation.errors });
      }

      // Step 3: Determine or create projectId
      const projectId =
        input.projectId ||
        `proj_${Date.now()}_${input.conversationId.slice(0, 8)}`;

      // Step 4: Store in database
      logger.info(`[${this.name}] Storing parsed data in ProjectContext...`);
      await this.storeInDatabase(projectId, input, parsed);

      // Step 5: Log execution
      const duration = Date.now() - startTime;
      await this.logExecution(projectId, input, parsed, true, duration);

      logger.info(`[${this.name}] Analysis complete in ${duration}ms`);

      return {
        success: true,
        projectId,
        parsed,
        stats,
        validation,
        message: validation.valid
          ? `Successfully analyzed blueprint with ${stats.featureCount} features and ${stats.techCount} technologies.`
          : `Analysis complete with warnings: ${validation.errors.join(", ")}`,
      };
    } catch (error) {
      logger.error(
        `[${this.name}] Analysis failed:`,
        error instanceof Error ? error : undefined
      );

      // Log failed execution
      const projectId = input.projectId || "unknown";
      await this.logExecution(
        projectId,
        input,
        null,
        false,
        Date.now() - startTime,
        error
      );

      throw error;
    }
  }

  private async storeInDatabase(
    projectId: string,
    input: AnalyzerInput,
    parsed: ParsedBlueprint
  ): Promise<void> {
    try {
      await prisma.projectContext.upsert({
        where: { projectId },
        update: {
          blueprint: {
            raw: input.blueprint, // 🔥 ADD: Store raw blueprint
            parsed: parsed, // 🔥 ADD: Store parsed version
          } as any,
          currentPhase: "research",
          updatedAt: new Date(),
        },
        create: {
          projectId,
          userId: input.userId,
          conversationId: input.conversationId,
          currentPhase: "research",
          blueprint: {
            raw: input.blueprint, // 🔥 ADD: Store raw blueprint
            parsed: parsed, // 🔥 ADD: Store parsed version
          } as any,
          version: 1,
        },
      });

      logger.info(`[${this.name}] Stored ProjectContext for ${projectId}`);
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

  private async logExecution(
    projectId: string,
    input: AnalyzerInput,
    parsed: ParsedBlueprint | null,
    success: boolean,
    durationMs: number,
    error?: unknown
  ): Promise<void> {
    try {
      await prisma.agentExecution.create({
        data: {
          projectId,
          agentName: this.name,
          phase: "analysis",
          input: {
            conversationId: input.conversationId,
            blueprintLength: input.blueprint.length,
          } as any,
          output: parsed
            ? ({
                projectName: parsed.projectName,
                featureCount: parsed.features.length,
                techCount: parsed.techStack.length,
              } as any)
            : null,
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

  async getExistingAnalysis(
    projectId: string
  ): Promise<ParsedBlueprint | null> {
    try {
      const context = await prisma.projectContext.findUnique({
        where: { projectId },
        select: { blueprint: true },
      });

      if (context?.blueprint) {
        return context.blueprint as any as ParsedBlueprint;
      }

      return null;
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to retrieve existing analysis:`,
        error instanceof Error ? error : undefined
      );
      return null;
    }
  }

  async getCurrentPhase(projectId: string): Promise<string | null> {
    try {
      const context = await prisma.projectContext.findUnique({
        where: { projectId },
        select: { currentPhase: true },
      });

      return context?.currentPhase || null;
    } catch (error) {
      logger.error(
        `[${this.name}] Failed to get current phase:`,
        error instanceof Error ? error : undefined
      );
      return null;
    }
  }
}

// Export singleton instance
export const analyzerAgent = new AnalyzerAgent();
