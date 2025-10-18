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
};
