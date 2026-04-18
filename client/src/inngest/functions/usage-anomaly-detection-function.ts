// src/inngest/functions/usage-anomaly-detection-function.ts
import { inngest } from '../client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import {
  CYCLE_LIMITS,
  cycleKeyFor,
  getCycleUsage,
  type CycleTool,
} from '@/lib/rate-limit';

/**
 * usageAnomalyDetectionFunction
 *
 * Daily sweep that flags paying users whose current-cycle usage on any
 * of the four AI-heavy tools (Research, Coach, Composer, Packager)
 * exceeds THRESHOLD_MULTIPLIER × the Compound tier cap — i.e. they
 * are spending 3x what even the most generous tier is provisioned
 * for. This is not a blocker (per-request caps already returned 429
 * long before this point); it is a humans-in-the-loop trigger for
 * investigating signup-for-abuse scenarios (shared accounts, scripted
 * clients, credential-sharing inside a company).
 *
 * Alert routing:
 *   1. ALWAYS — logger.error with structured fields. Sentry picks
 *      this up and can email / page the configured operator list.
 *   2. IF env.USAGE_ANOMALY_WEBHOOK_URL is set — POST a JSON payload
 *      compatible with Slack / Discord / any generic webhook. Matches
 *      the user's request for "configurable via environment variable"
 *      without re-adding the email service that was removed in Stage 3.
 *
 * Idempotency:
 *   The sweep is stateless — it reads counters, it does not mutate
 *   them. Running twice on the same day just fires duplicate alerts.
 *   Acceptable for low-volume anomalies; the alerting channel can
 *   dedupe if spam becomes a problem.
 *
 * Scalability:
 *   Capped at ANOMALY_CANDIDATE_CAP active subscriptions per run.
 *   The cron runs daily so unprocessed tails roll over. When this cap
 *   is consistently hit, switch to cursor pagination — the warning
 *   log surfaces the moment we cross.
 */

const ANOMALY_CANDIDATE_CAP = 1000;
const THRESHOLD_MULTIPLIER  = 3;
const TOOLS: readonly CycleTool[] = ['research', 'coach', 'composer', 'packager'];

/** 3x the Compound-tier cap per tool — the anomaly threshold. */
function anomalyThreshold(tool: CycleTool): number {
  const compoundKey = cycleKeyFor(tool, 'compound');
  return CYCLE_LIMITS[compoundKey].limit * THRESHOLD_MULTIPLIER;
}

interface AnomalyAlert {
  userId:        string;
  userEmail:     string | null;
  tier:          string;
  tool:          CycleTool;
  toolLabel:     string;
  usage:         number;
  cap:           number;
  multiplier:    number;
  cycleEndsAt:   string;
}

async function sendWebhookAlert(alert: AnomalyAlert): Promise<void> {
  const url = env.USAGE_ANOMALY_WEBHOOK_URL;
  if (!url) return;
  try {
    // Slack/Discord accept a simple `{ text }` body. For richer
    // integrations (PagerDuty, custom receivers), the endpoint
    // should parse the structured payload from `attachments`.
    const text =
      `🚨 NeuraLaunch usage anomaly — ${alert.toolLabel}: ` +
      `user ${alert.userEmail ?? alert.userId} (${alert.tier}) hit ` +
      `${alert.usage} calls this cycle, ${alert.multiplier.toFixed(1)}× ` +
      `the Compound cap of ${alert.cap / THRESHOLD_MULTIPLIER}. ` +
      `Cycle ends ${alert.cycleEndsAt}.`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, attachments: [alert] }),
    });
    if (!res.ok) {
      logger.warn('Usage anomaly webhook returned non-OK', {
        status:   res.status,
        userId:   alert.userId,
        tool:     alert.tool,
      });
    }
  } catch (err) {
    logger.error(
      'Usage anomaly webhook POST failed',
      err instanceof Error ? err : new Error(String(err)),
      { userId: alert.userId, tool: alert.tool },
    );
  }
}

export const usageAnomalyDetectionFunction = inngest.createFunction(
  {
    id:      'usage-anomaly-detection',
    name:    'Usage — Anomaly Detection Sweep',
    retries: 1,
    triggers: [
      // Daily at 06:00 UTC — early morning in Europe / overnight in
      // the US / mid-morning in West Africa. Fires when traffic is
      // lowest so the cost-per-user read-through of Redis is cheap.
      { cron: '0 6 * * *' },
    ],
  },
  async ({ event, step }) => {
    const log = logger.child({ inngestFunction: 'usageAnomalyDetection', runId: event.id });

    // Load paying subscriptions (active or past_due — both are still
    // on a billing cycle and can consume tool quota). Cancelled /
    // paused subscriptions are excluded because their cycle end is
    // historical and the Redis keys will have expired. Legacy
    // free-tier backfill rows are excluded via the tier filter.
    const subscriptions = await step.run('load-paying-subscriptions', async () => {
      const rows = await prisma.subscription.findMany({
        where: {
          status: { in: ['active', 'past_due'] },
          tier:   { in: ['execute', 'compound'] },
        },
        select: {
          userId:           true,
          tier:             true,
          currentPeriodEnd: true,
          user: { select: { email: true } },
        },
        take: ANOMALY_CANDIDATE_CAP,
      });
      if (rows.length === ANOMALY_CANDIDATE_CAP) {
        log.warn('[UsageAnomaly] Hit candidate cap — some subscriptions skipped', {
          cap: ANOMALY_CANDIDATE_CAP,
        });
      }
      return rows;
    });

    if (subscriptions.length === 0) {
      log.info('No paying subscriptions to sweep');
      return { swept: 0, flagged: 0 };
    }

    // For each subscription × each tool, read the cycle counter. The
    // step is not wrapped in step.run because it's stateless reads
    // against Redis — retrying the whole function is the correct
    // unit of atomicity here.
    const alerts: AnomalyAlert[] = [];

    for (const sub of subscriptions) {
      // Inngest serialises step.run() return values through JSON, so
      // a Date field comes back as an ISO string. Coerce once per
      // subscription to keep the downstream calls typed.
      const cycleEndsAt = new Date(sub.currentPeriodEnd);

      for (const tool of TOOLS) {
        // Check against the Compound threshold regardless of tier.
        // An Execute user hitting 3× the Compound cap is an even
        // stronger anomaly signal than a Compound user doing the
        // same.
        const threshold = anomalyThreshold(tool);
        const compoundKey = cycleKeyFor(tool, 'compound');
        const executeKey  = cycleKeyFor(tool, 'execute');

        // Users can have counters under either key depending on tier
        // transitions during the cycle. Read both and take the max —
        // the goal is to find anomalous cumulative usage.
        const [compoundUsage, executeUsage] = await Promise.all([
          getCycleUsage({ key: compoundKey, userId: sub.userId, cycleEndsAt }),
          getCycleUsage({ key: executeKey,  userId: sub.userId, cycleEndsAt }),
        ]);
        const usage = Math.max(compoundUsage.used, executeUsage.used);

        if (usage > threshold) {
          alerts.push({
            userId:      sub.userId,
            userEmail:   sub.user.email,
            tier:        sub.tier,
            tool,
            toolLabel:   compoundUsage.toolLabel,
            usage,
            cap:         threshold,
            multiplier:  usage / (threshold / THRESHOLD_MULTIPLIER),
            cycleEndsAt: cycleEndsAt.toISOString(),
          });
        }
      }
    }

    if (alerts.length === 0) {
      log.info('[UsageAnomaly] Sweep complete — no anomalies', {
        swept: subscriptions.length,
      });
      return { swept: subscriptions.length, flagged: 0 };
    }

    // Emit the alerts. logger.error fires for every anomaly so
    // Sentry captures them; webhook POST fires only when configured.
    for (const alert of alerts) {
      logger.error(
        '[UsageAnomaly] Extreme usage detected',
        new Error('usage-anomaly'),
        {
          userId:      alert.userId,
          userEmail:   alert.userEmail,
          tier:        alert.tier,
          tool:        alert.tool,
          toolLabel:   alert.toolLabel,
          usage:       alert.usage,
          threshold:   alert.cap,
          multiplier:  Number(alert.multiplier.toFixed(2)),
          cycleEndsAt: alert.cycleEndsAt,
        },
      );
      await sendWebhookAlert(alert);
    }

    log.warn('[UsageAnomaly] Sweep complete — anomalies flagged', {
      swept:   subscriptions.length,
      flagged: alerts.length,
    });

    return { swept: subscriptions.length, flagged: alerts.length };
  },
);
