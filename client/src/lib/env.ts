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

  // OAuth Providers — web
  GOOGLE_CLIENT_ID:     z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID:     z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),

  // OAuth Providers — mobile
  // Google is shared with the web app (the mobile callback URL is
  // registered as an additional Authorized redirect URI on the same
  // OAuth 2.0 Client). GitHub does not allow multiple callback URLs
  // per OAuth App, so a separate "NeuraLaunch Mobile" app exists and
  // ships its own client ID + secret.
  GITHUB_MOBILE_CLIENT_ID:     z.string().min(1),
  GITHUB_MOBILE_CLIENT_SECRET: z.string().min(1),

  // AI Services
  ANTHROPIC_API_KEY: z.string().min(1),
  // Google AI — used as the second fallback for question generation
  // when Anthropic is overloaded. Optional: when missing, the fallback
  // chain stops at Haiku and a final failure is surfaced to the client.
  GOOGLE_AI_API_KEY: z.string().optional(),

  // Voice transcription providers.
  // Primary: Deepgram Nova-2 at $0.0043/min. Fallback: OpenAI Whisper
  // at $0.006/min. Both are optional at startup so the app can boot
  // without voice configured — the transcribe route refuses requests
  // at runtime when no provider key is set.
  DEEPGRAM_API_KEY: z.string().optional(),
  OPENAI_API_KEY:   z.string().optional(),

  // Search / Research — both research providers are exposed to every
  // research-enabled agent as two independently-named tools (exa_search,
  // tavily_search). Both are optional: missing keys make the
  // corresponding tool unavailable to the agent (the agent's tool list
  // shrinks accordingly), but the call still proceeds. The agent
  // chooses which tool to use per query — there is no auto-routing.
  TAVILY_API_KEY: z.string().optional(),
  EXA_API_KEY:    z.string().optional(),

  // Note: RESEND_* variables were removed in Stage 7.1 because the
  // email service (src/lib/email-service.ts) was deleted in Stage 3
  // commit 4 along with its only call site. Leaving the env vars
  // required would have prevented the app from starting in any
  // environment that did not set them.

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
