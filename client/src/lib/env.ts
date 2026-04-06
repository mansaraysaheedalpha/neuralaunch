// src/lib/env.ts
/**
 * Environment Variable Validation
 *
 * Validates all required environment variables at application startup.
 * All other files must import `env` from here — never access process.env directly.
 */
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().min(1),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL:   z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Authentication
  NEXTAUTH_URL:    z.string().url().min(1),
  NEXTAUTH_SECRET: z.string().min(32),

  // OAuth Providers
  GOOGLE_CLIENT_ID:     z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID:     z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),

  // AI Services
  ANTHROPIC_API_KEY: z.string().min(1),

  // Search / Research
  TAVILY_API_KEY: z.string().optional(),

  // Email (Resend)
  RESEND_API_KEY:    z.string().min(1),
  RESEND_DOMAIN:     z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email().default('noreply@neuralaunch.app'),
  RESEND_REPLY_TO:   z.string().email().optional(),

  // Background jobs
  INNGEST_EVENT_KEY:   z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),

  // Public app URL
  NEXT_PUBLIC_APP_URL:  z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  // Node environment
  NODE_ENV:   z.enum(['development', 'production', 'test']).default('development'),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.issues.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
      const msg = `❌ FATAL: Environment validation failed:\n${missing}\n\nCheck your .env.local file or Vercel environment variables.`;
      console.error(msg);
      throw new Error(msg);
    }
    throw error;
  }
}

export const env = validateEnv();
