// src/lib/agents/thought-stream.ts
/**
 * Thought Stream Service
 * Provides a way for agents to emit their thought processes in real-time
 * Similar to how GitHub Copilot shows "Starting GitHub MCP server", etc.
 */

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

export type ThoughtType = 
  | "starting"      // Agent is starting up
  | "thinking"      // Agent is processing/analyzing
  | "accessing"     // Agent is accessing a tool/service/database
  | "analyzing"     // Agent is analyzing data
  | "deciding"      // Agent is making a decision
  | "executing"     // Agent is executing an action
  | "completing"    // Agent is completing its work
  | "error";        // Agent encountered an error

export interface Thought {
  id: string;
  agentName: string;
  projectId: string;
  type: ThoughtType;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * ThoughtStream class for managing agent thought processes
 */
export class ThoughtStream {
  private projectId: string;
  private agentName: string;
  private thoughts: Thought[] = [];
  private listeners: ((thought: Thought) => void)[] = [];

  constructor(projectId: string, agentName: string) {
    this.projectId = projectId;
    this.agentName = agentName;
  }

  /**
   * Emit a thought to all listeners and store it
   */
  async emit(type: ThoughtType, message: string, metadata?: Record<string, any>): Promise<void> {
    const thought: Thought = {
      id: `thought_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentName: this.agentName,
      projectId: this.projectId,
      type,
      message,
      timestamp: new Date(),
      metadata,
    };

    this.thoughts.push(thought);

    // Log to console for debugging
    logger.info(`[${this.agentName}] 💭 ${message}`, metadata);

    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(thought);
      } catch (error) {
        logger.error(`[ThoughtStream] Error in listener:`, error as Error);
      }
    });

    // Store in database asynchronously (don't await to avoid blocking)
    this.persistThought(thought).catch(error => {
      logger.error(`[ThoughtStream] Failed to persist thought:`, error as Error);
    });
  }

  /**
   * Register a listener for real-time thought updates
   */
  onThought(listener: (thought: Thought) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Get all thoughts emitted so far
   */
  getThoughts(): Thought[] {
    return [...this.thoughts];
  }

  /**
   * Persist thought to database
   */
  private async persistThought(thought: Thought): Promise<void> {
    try {
      // Store thoughts in AgentExecution metadata or a separate table
      // For now, we'll just log them. In production, you might want to store them.
      // await prisma.agentThought.create({ data: thought }); // If you add this table
    } catch (error) {
      // Silent fail - thought persistence is not critical
    }
  }

  /**
   * Helper methods for common thought patterns
   */

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

  analyzing(subject: string, details?: Record<string, any>): Promise<void> {
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

  error(errorMsg: string, metadata?: Record<string, any>): Promise<void> {
    return this.emit("error", `Error: ${errorMsg}`, metadata);
  }
}

/**
 * Global thought stream registry
 * Manages active thought streams for all agents
 */
class ThoughtStreamRegistry {
  private streams: Map<string, ThoughtStream> = new Map();

  /**
   * Get or create a thought stream for a project and agent
   */
  getStream(projectId: string, agentName: string): ThoughtStream {
    const key = `${projectId}:${agentName}`;
    
    if (!this.streams.has(key)) {
      this.streams.set(key, new ThoughtStream(projectId, agentName));
    }

    return this.streams.get(key)!;
  }

  /**
   * Get all thoughts for a project
   */
  getProjectThoughts(projectId: string): Thought[] {
    const thoughts: Thought[] = [];
    
    for (const [key, stream] of this.streams.entries()) {
      if (key.startsWith(projectId + ':')) {
        thoughts.push(...stream.getThoughts());
      }
    }

    // Sort by timestamp
    return thoughts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Clear streams for a project (cleanup)
   */
  clearProject(projectId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.streams.keys()) {
      if (key.startsWith(projectId + ':')) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.streams.delete(key));
  }
}

// Export singleton instance
export const thoughtStreamRegistry = new ThoughtStreamRegistry();

/**
 * Helper function to create a thought stream for an agent
 */
export function createThoughtStream(projectId: string, agentName: string): ThoughtStream {
  return thoughtStreamRegistry.getStream(projectId, agentName);
}
