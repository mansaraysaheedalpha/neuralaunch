// src/lib/paddle/client.ts
import 'server-only';
import { Environment, LogLevel, Paddle } from '@paddle/paddle-node-sdk';
import { env } from '@/lib/env';

/**
 * Paddle Node SDK singleton.
 *
 * Cached on globalThis so Next.js hot-reload does not construct a new
 * client on every request in development — the Paddle client carries
 * its own HTTP agent pool and re-creating it per request leaks sockets.
 *
 * Environment selection is driven by NEXT_PUBLIC_PADDLE_ENV. When the
 * production account is approved, flip that variable (and the three
 * secret values) in Vercel — no code change required. Both sandbox and
 * production paths go through the same SDK surface.
 */

const isProductionEnv = env.NEXT_PUBLIC_PADDLE_ENV === 'production';

type GlobalWithPaddle = typeof globalThis & { __paddleClient?: Paddle };
const globalForPaddle = globalThis as GlobalWithPaddle;

export const paddleClient: Paddle =
  globalForPaddle.__paddleClient ??
  new Paddle(env.PADDLE_API_KEY, {
    environment: isProductionEnv ? Environment.production : Environment.sandbox,
    logLevel:    isProductionEnv ? LogLevel.error       : LogLevel.warn,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPaddle.__paddleClient = paddleClient;
}
