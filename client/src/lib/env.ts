// src/lib/env.ts
/**
 * Environment Variable Validation
 *
 * This module validates all required environment variables at application startup
 * using Zod to fail fast and provide clear error messages.
 */

import { z } from "zod";
import { logger } from "./logger"; // Assuming logger is available

const KEY_LENGTH = 32; // Bytes for AES-256

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),

  // Authentication
  NEXTAUTH_URL: z.string().url().min(1, "NEXTAUTH_URL is required"),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters"),

  // OAuth Providers
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  VERCEL_CLIENT_ID: z.string().min(1, "VERCEL_CLIENT_ID is required"),
  VERCEL_CLIENT_SECRET: z.string().min(1, "VERCEL_CLIENT_SECRET is required"),
  GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
  GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),

  // AI Services
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required for Gemini AI"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().optional(), // Make optional if not always required

  // Email Service
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),

  // Pusher (Realtime Logs)
  NEXT_PUBLIC_PUSHER_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_PUSHER_KEY is required"),
  NEXT_PUBLIC_PUSHER_CLUSTER: z
    .string()
    .min(1, "NEXT_PUBLIC_PUSHER_CLUSTER is required"),
  PUSHER_APP_ID: z.string().min(1, "PUSHER_APP_ID is required"),
  PUSHER_SECRET: z.string().min(1, "PUSHER_SECRET is required"),

  // Security & Background Jobs
  ENCRYPTION_KEY: z
    .string()
    .min(1, "ENCRYPTION_KEY is required")
    .refine((key) => {
      try {
        return Buffer.from(key, "base64").length === KEY_LENGTH;
      } catch {
        return false;
      }
    }, `ENCRYPTION_KEY must be a valid 32-byte Base64 encoded string.`),
  CRON_SECRET: z
    .string()
    .min(1, "CRON_SECRET is required for Vercel Cron jobs"),
  INNGEST_EVENT_KEY: z
    .string()
    .min(1, "INNGEST_EVENT_KEY is required for background jobs"), // *** ADDED ***

  // Node Environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }
  logger.info("⚙️ Validating environment variables...");
  try {
    validatedEnv = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      VERCEL_CLIENT_ID: process.env.VERCEL_CLIENT_ID,
      VERCEL_CLIENT_SECRET: process.env.VERCEL_CLIENT_SECRET,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
      NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      PUSHER_APP_ID: process.env.PUSHER_APP_ID,
      PUSHER_SECRET: process.env.PUSHER_SECRET,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
      INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY, // *** ADDED ***
      NODE_ENV: process.env.NODE_ENV,
    });
    logger.info("✅ Environment variables validated successfully.");
    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      const fullErrorMessage = `❌ FATAL: Environment validation failed:\n${missingVars}\n\nPlease check your environment configuration.`;
      logger.error(fullErrorMessage);
      throw new Error(fullErrorMessage);
    }
    logger.error(
      "❌ Unexpected error during environment validation:",
      error instanceof Error ? error : undefined
    );
    throw error;
  }
}

export function getEnv(): Env {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}

// Trigger validation on application load
try {
  validateEnv();
  logger.info("Environment loaded and validated on startup.");
} catch (error) {
  if (process.env.NODE_ENV === "production") {
    console.error("Halting process due to invalid environment configuration.");
    process.exit(1);
  }
}
