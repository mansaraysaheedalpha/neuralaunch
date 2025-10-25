// src/lib/env.ts
/**
 * Environment Variable Validation
 * 
 * This module validates all required environment variables at application startup
 * to fail fast and provide clear error messages.
 */

import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),

  // Authentication
  NEXTAUTH_URL: z.string().url().min(1, "NEXTAUTH_URL is required"),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

  // AI Services
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required for Gemini AI"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required for MVP generation"),

  // Email Service
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required for email notifications"),

  // Node Environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

/**
 * Validates environment variables and caches the result
 * @throws {Error} If validation fails
 */
export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  try {
    validatedEnv = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      NODE_ENV: process.env.NODE_ENV || "development",
    });

    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => `  - ${String(e.path.join("."))}: ${e.message}`).join("\n");
      throw new Error(`❌ Environment validation failed:\n${missingVars}\n\nPlease check your .env file and ensure all required variables are set.`);
    }
    throw error;
  }
}

/**
 * Gets a validated environment variable
 * Safe to use after validateEnv() has been called
 */
export function getEnv(): Env {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}

// Validate on module load in production
if (process.env.NODE_ENV === "production") {
  validateEnv();
}
