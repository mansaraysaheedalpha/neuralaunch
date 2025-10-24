// src/lib/models.ts

/**
 * Centralized configuration for all AI models used in the application.
 * This allows for easy swapping, testing, and management of models.
 */
export const AI_MODELS = {
  /**
   * For core, high-quality, complex generation.
   * Use for: Startup Blueprints, AI Assistant outputs.
   */
  PRIMARY: "gemini-2.5-pro",

  /**
   * For fast, efficient, and smaller tasks.
   * Use for: Chat Titles, Landing Page Copy.
   */
  FAST: "gemini-2.5-flash",

  /**
   * For best-in-class code generation and complex reasoning.
   * Use for: Code-related sprint tasks.
   */
  OPENAI: "gpt-4o",

  /**
   * --- ADD THIS BLOCK ---
   * For generating vector embeddings.
   * Use for: AI Cofounder memory.
   */
  EMBEDDING: "text-embedding-3-large",
};
