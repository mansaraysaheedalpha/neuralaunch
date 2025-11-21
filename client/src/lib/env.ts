// src/lib/env.ts
/**
 * Environment Variable Validation
 *
 * This module validates all required environment variables at application startup
 * using Zod to fail fast and provide clear error messages.
 *
 * It exports a single `env` object that MUST be used by the rest of the application
 * instead of `process.env`.
 */

import { z } from "zod";

const KEY_LENGTH = 32; // Bytes for AES-256

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),

  // Upstash Redis (Optional - for rate limiting in production)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Upstash Vector (Optional - for agent memory/semantic search)
  // UPSTASH_VECTOR_REST_URL: z.string().url().optional(),
  // UPSTASH_VECTOR_REST_TOKEN: z.string().optional(),

  // Authentication
  NEXTAUTH_URL: z.string().url().min(1, "NEXTAUTH_URL is required"),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters"),

  GOOGLE_APPLICATION_CREDENTIALS_JSON: z
    .string()
    .min(
      1,
      "GOOGLE_APPLICATION_CREDENTIALS_JSON is required for Artifact Registry login."
    ),
  // OAuth Providers
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
  GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),

  // AI Services
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required for Gemini AI"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"), // Made this required

  // Video Generation (Optional - at least one required for video generation feature)
  REPLICATE_API_KEY: z.string().optional(), // For Stable Video Diffusion & Zeroscope
  RUNWAY_API_KEY: z.string().optional(), // For Runway Gen-2

  // Email Service (Resend)
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_DOMAIN: z
    .string()
    .min(1, "RESEND_DOMAIN is required (e.g., infinite-dynamics.com)"),
  RESEND_FROM_EMAIL: z
    .string()
    .email()
    .default("noreply@infinite-dynamics.com"),
  RESEND_REPLY_TO: z.string().email().optional(),

  // Webhooks & Notifications
  REVIEW_WEBHOOK_URL: z.string().url().optional(),

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
  INNGEST_EVENT_KEY: z.string().min(1, "INNGEST_EVENT_KEY is required"),
  INNGEST_SIGNING_KEY: z
    .string()
    .min(1, "INNGEST_SIGNING_KEY is required for production"),

  // Sandbox
  DOCKER_HOST_URL: z
    .string()
    .min(1, "DOCKER_HOST_URL is required for production sandbox"),
  DOCKER_CA_CERT: z
    .string()
    .min(1, "DOCKER_CA_CERT is required for production sandbox"),
  DOCKER_CLIENT_CERT: z
    .string()
    .min(1, "DOCKER_CLIENT_CERT is required for production sandbox"),
  DOCKER_CLIENT_KEY: z
    .string()
    .min(1, "DOCKER_CLIENT_KEY is required for production sandbox"),
  DOCKER_SOCKET_PATH: z.string().optional(),

  // GitHub Integration
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_MCP_TOKEN: z.string().optional(),

  // Web Search
  BRAVE_SEARCH_API_KEY: z.string().optional(),

  // MCP Servers
  MCP_SERVERS: z.string().optional(),
  MCP_PLAYWRIGHT_URL: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3100/mcp"),
  MCP_CLAUDE_SKILLS_URL: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3101/mcp"),

  // Deployment Platforms (all optional)
  VERCEL_TOKEN: z.string().optional(),
  RAILWAY_TOKEN: z.string().optional(),
  RENDER_API_KEY: z.string().optional(),
  NETLIFY_AUTH_TOKEN: z.string().optional(),
  DIGITALOCEAN_TOKEN: z.string().optional(),

  // Database Providers (all optional - at least one recommended for auto-provisioning)
  NEON_API_KEY: z.string().optional(), // Neon PostgreSQL (default, serverless)
  SUPABASE_API_KEY: z.string().optional(), // Supabase Management API key
  SUPABASE_ORG_ID: z.string().optional(), // Supabase organization ID for project creation
  MONGODB_ATLAS_PUBLIC_KEY: z.string().optional(), // MongoDB Atlas API public key
  MONGODB_ATLAS_PRIVATE_KEY: z.string().optional(), // MongoDB Atlas API private key
  MONGODB_ATLAS_PROJECT_ID: z.string().optional(), // MongoDB Atlas project ID
  PLANETSCALE_API_KEY: z.string().optional(), // PlanetScale API key
  PLANETSCALE_ORG_ID: z.string().optional(), // PlanetScale organization ID

  // Public Environment Variables
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  // CORS Configuration (Optional - comma-separated list of allowed origins)
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // Node Environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Vercel Environment
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env and returns a typed Env object.
 * This function is called immediately when the module is loaded.
 */
function validateEnv(): Env {
  try {
    // Zod will automatically parse process.env.
    // It will throw an error if any variable is missing or invalid.
   return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      const fullErrorMessage = `❌ FATAL: Environment validation failed:\n${missingVars}\n\nPlease check your .env.local file (for dev) or Vercel Environment Variables (for prod).`;
      console.error(fullErrorMessage); // Use console.error for startup errors
      throw new Error(fullErrorMessage);
    }
    console.error("❌ Unexpected error during environment validation:", error);
    throw error;
  }
}

// --- THIS IS THE FIX ---
// Validate the environment immediately on module load and export the result.
// All other files will import this `env` object.
export const env = validateEnv();

// We no longer need getEnv() or the old try/catch block at the end.
