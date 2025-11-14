/**
 * Enhanced Thought Stream with Deep Dive Mode
 * Supports both curated thoughts AND raw AI reasoning
 */

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

export type ThoughtType =
  | "starting"
  | "thinking"
  | "accessing"
  | "analyzing"
  | "deciding"
  | "executing"
  | "completing"
  | "error"
  | "deep_reasoning"; // ✅ NEW: For raw AI thoughts

export type ThoughtMode = "curated" | "deep_dive" | "both";

export interface Thought {
  id: string;
  agentName: string;
  projectId: string;
  type: ThoughtType;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  mode: ThoughtMode; // ✅ NEW: Track thought source
  rawReasoning?: string; // ✅ NEW: Store raw AI reasoning
}

export class ThoughtStream {
  private projectId: string;
  private agentName: string;
  private thoughts: Thought[] = [];
  private listeners: ((thought: Thought) => void)[] = [];
  private deepDiveEnabled: boolean = false; // ✅ NEW: Deep dive toggle

  constructor(
    projectId: string,
    agentName: string,
    enableDeepDive: boolean = false
  ) {
    this.projectId = projectId;
    this.agentName = agentName;
    this.deepDiveEnabled = enableDeepDive;
  }

  /**
   * ✅ NEW: Enable/disable deep dive mode
   */
  setDeepDiveMode(enabled: boolean): void {
    this.deepDiveEnabled = enabled;
    logger.info(
      `[${this.agentName}] Deep dive mode: ${enabled ? "ON" : "OFF"}`
    );
  }

  /**
   * Emit a curated thought (user-friendly)
   */
  async emit(
    type: ThoughtType,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const thought: Thought = {
      id: `thought_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentName: this.agentName,
      projectId: this.projectId,
      type,
      message,
      timestamp: new Date(),
      metadata,
      mode: "curated",
    };

    await this.persistAndNotify(thought);
  }

  /**
   * ✅ NEW: Emit raw AI reasoning (deep dive)
   */
  async emitDeepReasoning(
    rawReasoning: string,
    context?: string
  ): Promise<void> {
    if (!this.deepDiveEnabled) {
      // Skip if deep dive is disabled
      return;
    }

    const thought: Thought = {
      id: `thought_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentName: this.agentName,
      projectId: this.projectId,
      type: "deep_reasoning",
      message: context || "AI Internal Reasoning",
      timestamp: new Date(),
      rawReasoning,
      mode: "deep_dive",
    };

    await this.persistAndNotify(thought);
  }

  /**
   * ✅ NEW: Emit both curated and raw reasoning
   */
  async emitBoth(
    type: ThoughtType,
    curatedMessage: string,
    rawReasoning: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const thought: Thought = {
      id: `thought_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentName: this.agentName,
      projectId: this.projectId,
      type,
      message: curatedMessage,
      timestamp: new Date(),
      metadata,
      rawReasoning: this.deepDiveEnabled ? rawReasoning : undefined,
      mode: this.deepDiveEnabled ? "both" : "curated",
    };

    await this.persistAndNotify(thought);
  }

  /**
   * Persist and notify listeners
   */
  private async persistAndNotify(thought: Thought): Promise<void> {
    this.thoughts.push(thought);

    // Log to console
    if (thought.mode === "deep_dive" || thought.mode === "both") {
      logger.info(`[${this.agentName}] 🧠 Deep: ${thought.message}`, {
        reasoning: thought.rawReasoning?.substring(0, 200),
      });
    } else {
      logger.info(
        `[${this.agentName}] 💭 ${thought.message}`,
        thought.metadata
      );
    }

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(thought);
      } catch (error) {
        logger.error(`[ThoughtStream] Error in listener:`, error as Error);
      }
    });

    // Persist to database
    this.persistThought(thought).catch((error) => {
      logger.error(
        `[ThoughtStream] Failed to persist thought:`,
        error as Error
      );
    });
  }

  /**
   * Persist thought to database
   */
  private async persistThought(thought: Thought): Promise<void> {
    try {
      await prisma.agentThought.create({
        data: {
          id: thought.id,
          projectId: thought.projectId,
          agentName: thought.agentName,
          type: thought.type,
          message: thought.message,
          metadata: {
            ...thought.metadata,
            mode: thought.mode,
            rawReasoning: thought.rawReasoning,
          } as Record<string, unknown>,
          timestamp: thought.timestamp,
        },
      });
    } catch (error) {
      logger.warn(`[ThoughtStream] Failed to persist thought to DB:`, {
        error: error instanceof Error ? error.message : String(error),
        thoughtId: thought.id,
      });
    }
  }

  /**
   * Register a listener
   */
  onThought(listener: (thought: Thought) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Get all thoughts
   */
  getThoughts(): Thought[] {
    return [...this.thoughts];
  }

  // ✅ Helper methods (same as before, but now support deep dive)

  starting(action: string): Promise<void> {
    return this.emit("starting", `Starting ${action}...`);
  }

  thinking(about: string): Promise<void> {
    return this.emit("thinking", `Thinking about ${about}...`);
  }

  accessing(resource: string, details?: string): Promise<void> {
    const message = details
      ? `Accessing ${resource}: ${details}`
      : `Accessing ${resource}...`;
    return this.emit("accessing", message);
  }

  analyzing(subject: string, details?: Record<string, unknown>): Promise<void> {
    return this.emit("analyzing", `Analyzing ${subject}...`, details);
  }

  deciding(decision: string): Promise<void> {
    return this.emit("deciding", `Deciding on ${decision}...`);
  }

  executing(action: string): Promise<void> {
    return this.emit("executing", `Executing ${action}...`);
  }

  completing(summary: string): Promise<void> {
    return this.emit("completing", `Completed: ${summary}`);
  }

  error(errorMsg: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.emit("error", `Error: ${errorMsg}`, metadata);
  }
}

/**
 * Global thought stream registry
 */
class ThoughtStreamRegistry {
  private streams: Map<string, ThoughtStream> = new Map();

  getStream(
    projectId: string,
    agentName: string,
    enableDeepDive: boolean = false
  ): ThoughtStream {
    const key = `${projectId}:${agentName}`;

    if (!this.streams.has(key)) {
      this.streams.set(
        key,
        new ThoughtStream(projectId, agentName, enableDeepDive)
      );
    }

    return this.streams.get(key)!;
  }

  async getProjectThoughts(projectId: string): Promise<Thought[]> {
    try {
      const dbThoughts = await prisma.agentThought.findMany({
        where: { projectId },
        orderBy: { timestamp: "asc" },
      });

      return dbThoughts.map((t) => {
        const meta = t.metadata as Record<string, unknown> | null;
        return {
          id: t.id,
          agentName: t.agentName,
          projectId: t.projectId,
          type: t.type as ThoughtType,
          message: t.message,
          timestamp: t.timestamp,
          metadata: (meta && typeof meta === 'object' && 'metadata' in meta ? meta.metadata : {}) as Record<string, unknown>,
          mode: (meta && typeof meta === 'object' && 'mode' in meta ? meta.mode : "curated") as ThoughtMode,
          rawReasoning: (meta && typeof meta === 'object' && 'rawReasoning' in meta && typeof meta.rawReasoning === 'string' ? meta.rawReasoning : undefined),
        };
      });
    } catch (error) {
      logger.error(
        `[ThoughtStreamRegistry] Failed to fetch thoughts:`,
        error as Error
      );
      return [];
    }
  }

  clearProject(projectId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.streams.keys()) {
      if (key.startsWith(projectId + ":")) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.streams.delete(key));
  }

  async deleteProjectThoughts(projectId: string): Promise<void> {
    try {
      await prisma.agentThought.deleteMany({
        where: { projectId },
      });
      logger.info(
        `[ThoughtStreamRegistry] Deleted all thoughts for project ${projectId}`
      );
    } catch (error) {
      logger.error(
        `[ThoughtStreamRegistry] Failed to delete thoughts:`,
        error as Error
      );
      throw error;
    }
  }
}

export const thoughtStreamRegistry = new ThoughtStreamRegistry();

/**
 * ✅ UPDATED: Helper function with deep dive support
 */
export function createThoughtStream(
  projectId: string,
  agentName: string,
  enableDeepDive: boolean = false
): ThoughtStream {
  return thoughtStreamRegistry.getStream(projectId, agentName, enableDeepDive);
}
