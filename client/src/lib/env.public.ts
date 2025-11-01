// src/lib/env.public.ts

import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_PUSHER_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_PUSHER_KEY is required"),
  NEXT_PUBLIC_PUSHER_CLUSTER: z
    .string()
    .min(1, "NEXT_PUBLIC_PUSHER_CLUSTER is required"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .min(1, "NEXT_PUBLIC_APP_URL is required"),
  // Add any other NEXT_PUBLIC_ variables you have here
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

function validatePublicEnv(): PublicEnv {
  try {
    // Note: We parse process.env here, but Next.js makes these available.
    // In a local .env.local, they must be defined for this to pass.
    return publicEnvSchema.parse({
      NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
      NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      const fullErrorMessage = `❌ FATAL: Public environment validation failed:\n${missingVars}`;
      console.error(fullErrorMessage);
      throw new Error(fullErrorMessage);
    }
    console.error("❌ Unexpected error during public env validation:", error);
    throw error;
  }
}

export const publicEnv = validatePublicEnv();
