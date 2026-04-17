// src/lib/paddle/webhook-processor.ts
import 'server-only';

/**
 * Webhook event processor — stub. The full event-handling logic ships
 * in Phase 6. Kept as a no-op stub here so the webhook route compiles
 * in isolation and can be reviewed as a self-contained commit.
 */
export async function handleWebhookEvent(_event: unknown): Promise<void> {
  return;
}
