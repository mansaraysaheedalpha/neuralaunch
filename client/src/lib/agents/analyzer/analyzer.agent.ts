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
import { Prisma } from "@prisma/client";
import { getErrorMessage, toError } from "@/lib/error-utils";
import { createThoughtStream, type ThoughtStream } from "@/lib/agents/thought-stream";
import {
  deserializeParsedBlueprint,
  parseStoredBlueprint,
  serializeBlueprintForStorage,
} from "./blueprint-storage";

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

/**
 * Analyzer Agent - Intelligent Blueprint Parsing
 *
 * CAPABILITIES:
 * ✅ Blueprint Parsing - Extracts structured data from user input
 * ✅ Feature Detection - Identifies core features and requirements
 * ✅ Tech Stack Extraction - Recognizes mentioned technologies
 * ✅ Validation - Ensures blueprint completeness before planning
 * ✅ Thought Stream Integration - Provides transparent analysis process
 *
 * This agent serves as the entry point for the planning phase by:
 * - Converting user blueprints into structured project data
 * - Validating completeness and identifying gaps
 * - Setting up project context for subsequent agents
 * - Enabling accurate research and planning
 */
export class AnalyzerAgent {
  name = "Analyzer";
  description = "Parses blueprints and extracts structured information";

  async execute(input: AnalyzerInput): Promise<AnalyzerOutput> {
    const startTime = Date.now();
    logger.info(
      `[${this.name}] Starting analysis for conversation ${input.conversationId}`
    );

    // Create thought stream for this execution
    const thoughts: ThoughtStream = createThoughtStream(
      input.projectId || input.conversationId,
      this.name
    );

    try {
      await thoughts.starting("blueprint analysis");
      
      // Step 1: Parse the blueprint
      await thoughts.accessing("blueprint parser", "Preparing to parse project blueprint");
      logger.info(`[${this.name}] Parsing blueprint...`);
      
      await thoughts.analyzing("blueprint structure and content");
      const parsed = parseBlueprint(input.blueprint);

      // Step 2: Get stats and validation
      await thoughts.thinking("extracting statistics from parsed data");
      const stats = getBlueprintStats(parsed);
      
      await thoughts.thinking("validating blueprint completeness");
      const validation = validateParsedBlueprint(parsed);

      await thoughts.emit("analyzing", `Found ${stats.featureCount} features and ${stats.techCount} technologies`, {
        featureCount: stats.featureCount,
        techCount: stats.techCount,
      });
      
      logger.info(
        `[${this.name}] Parsed ${stats.featureCount} features, ${stats.techCount} technologies`
      );

      if (!validation.valid) {
        await thoughts.emit("deciding", `Found ${validation.errors.length} validation issues that need attention`, {
          issues: validation.errors,
        });
        logger.warn(`[${this.name}] Validation issues:`, { errors: validation.errors });
      } else {
        await thoughts.deciding("Blueprint validation passed - ready to proceed");
      }

      // Step 3: Determine or create projectId
      const projectId =
        input.projectId ||
        `proj_${Date.now()}_${input.conversationId.slice(0, 8)}`;

      // Step 4: Store in database
      await thoughts.accessing("database", "Storing analyzed data in ProjectContext");
      logger.info(`[${this.name}] Storing parsed data in ProjectContext...`);
      await this.storeInDatabase(projectId, input, parsed);

      // Step 5: Log execution
      const duration = Date.now() - startTime;
      await thoughts.executing("logging analysis results");
      await this.logExecution(projectId, input, parsed, true, duration);

      await thoughts.completing(`Analyzed blueprint with ${stats.featureCount} features in ${duration}ms`);
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
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const stack = error instanceof Error ? error.stack : undefined;

      await thoughts.error(message, stack ? { stack } : undefined);

      if (error instanceof Error) {
        logger.error(`[${this.name}] Analysis failed:`, error);
      } else {
        logger.error(`[${this.name}] Analysis failed: ${message}`);
      }

      const projectId = input.projectId || "unknown";
      await this.logExecution(
        projectId,
        input,
        null,
        false,
        Date.now() - startTime,
        message
      );

      if (error instanceof Error) {
        throw error;
      }

      throw toError(error);
    }
  }

  private async storeInDatabase(
    projectId: string,
    input: AnalyzerInput,
    parsed: ParsedBlueprint
  ): Promise<void> {
    try {
      const blueprintPayload = serializeBlueprintForStorage(input.blueprint, parsed);

      const upsertArgs: Prisma.ProjectContextUpsertArgs = {
        where: { projectId },
        update: {
          blueprint: blueprintPayload,
          currentPhase: "research",
          updatedAt: new Date(),
        },
        create: {
          projectId,
          userId: input.userId,
          conversationId: input.conversationId,
          currentPhase: "research",
          blueprint: blueprintPayload,
          version: 1,
        },
      };

      await prisma.projectContext.upsert(upsertArgs);

      logger.info(`[${this.name}] Stored ProjectContext for ${projectId}`);
    } catch (error: unknown) {
      const message = getErrorMessage(error);

      if (error instanceof Error) {
        logger.error(`[${this.name}] Failed to store in database:`, error);
      } else {
        logger.error(
          `[${this.name}] Failed to store in database: ${message}`
        );
      }

      throw new Error(`Database storage failed: ${message}`);
    }
  }

  private async logExecution(
    projectId: string,
    input: AnalyzerInput,
    parsed: ParsedBlueprint | null,
    success: boolean,
    durationMs: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      const inputPayload: Prisma.JsonObject = {
        conversationId: input.conversationId,
        blueprintLength: input.blueprint.length,
      };

      const outputPayload: Prisma.JsonObject | null = parsed
        ? {
            projectName: parsed.projectName,
            featureCount: parsed.features.length,
            techCount: parsed.techStack.length,
          }
        : null;

      const createArgs: Prisma.AgentExecutionCreateArgs = {
        data: {
          projectId,
          agentName: this.name,
          phase: "analysis",
          input: inputPayload,
          output: outputPayload,
          success,
          durationMs,
          error: errorMessage ?? null,
        },
      };

      await prisma.agentExecution.create(createArgs);
    } catch (logError: unknown) {
      const message = getErrorMessage(logError);

      if (logError instanceof Error) {
        logger.error(`[${this.name}] Failed to log execution:`, logError);
      } else {
        logger.error(
          `[${this.name}] Failed to log execution: ${message}`
        );
      }
    }
  }

  async getExistingAnalysis(
    projectId: string
  ): Promise<ParsedBlueprint | null> {
    try {
      const findBlueprintArgs: Prisma.ProjectContextFindUniqueArgs = {
        where: { projectId },
        select: { blueprint: true },
      };

      const context = await prisma.projectContext.findUnique(findBlueprintArgs);

      const storedBlueprint = parseStoredBlueprint(context?.blueprint);

      if (storedBlueprint) {
        return deserializeParsedBlueprint(storedBlueprint.parsed);
      }

      return null;
    } catch (error: unknown) {
      const message = getErrorMessage(error);

      if (error instanceof Error) {
        logger.error(
          `[${this.name}] Failed to retrieve existing analysis:`,
          error
        );
      } else {
        logger.error(
          `[${this.name}] Failed to retrieve existing analysis: ${message}`
        );
      }

      return null;
    }
  }

  async getCurrentPhase(projectId: string): Promise<string | null> {
    try {
      const findPhaseArgs: Prisma.ProjectContextFindUniqueArgs = {
        where: { projectId },
        select: { currentPhase: true },
      };

      const context = await prisma.projectContext.findUnique(findPhaseArgs);

      return context?.currentPhase || null;
    } catch (error: unknown) {
      const message = getErrorMessage(error);

      if (error instanceof Error) {
        logger.error(
          `[${this.name}] Failed to get current phase:`,
          error
        );
      } else {
        logger.error(
          `[${this.name}] Failed to get current phase: ${message}`
        );
      }

      return null;
    }
  }
}

// Export singleton instance
export const analyzerAgent = new AnalyzerAgent();
