// src/lib/email/templates/payment-failed.ts
//
// Dunning email sent when Paddle's subscription.payment_failed webhook
// fires. Supplements the in-Settings amber banner — users don't live
// in Settings, so an email is often the only way they'll know their
// card was declined before Paddle's 14-day retry schedule cancels
// their subscription.
//
// Plain text — the email body doesn't need HTML, and plain text
// renders correctly in every client including spam-filter previews.

import 'server-only';
import { env } from '@/lib/env';
import { sendEmail, type SendEmailResult } from '../sender';
import { logger } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';

const SUBJECT = "Your NeuraLaunch payment didn't go through";
const TEMPLATE_TAG = 'dunning-payment-failed';
const DUNNING_COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours

export interface PaymentFailedEmailInput {
  userId:     string;
  email:      string;
  name:       string | null;
  /** Which paid tier the user had before demotion — 'execute' or 'compound'. */
  priorTier:  string;
}

function renderBody(name: string | null, priorTier: string): string {
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,';
  const tierLabel = priorTier === 'compound'
    ? 'Compound'
    : priorTier === 'execute'
      ? 'Execute'
      : 'NeuraLaunch';
  const portalPath = `${env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? 'https://startupvalidator.app'}/settings`;
  return [
    greeting,
    '',
    `We tried to process your NeuraLaunch ${tierLabel} subscription renewal but the payment didn't go through.`,
    '',
    'Your access to paid features is paused while we retry. You can restore access immediately by updating your card:',
    '',
    portalPath,
    '',
    "If you don't update your card, your subscription will be automatically canceled after Paddle's retry period ends (typically 14 days).",
    '',
    'Questions? Reply to this email or reach us at info@tabempa.com.',
    '',
    '— The NeuraLaunch Team',
  ].join('\n');
}

/**
 * Dispatch a payment-failed dunning email with a 24-hour per-user
 * cooldown so Paddle's retry storm (up to ~4 retries in 14 days)
 * doesn't trigger 4 separate emails. First attempt sends; subsequent
 * attempts inside the cooldown window are logged and skipped.
 *
 * Cooldown state lives in Redis (`dunning-sent:<userId>`). When
 * Redis is unavailable, we fail OPEN — send the email anyway
 * because a missed dunning notice is a far worse failure than a
 * duplicate one.
 */
export async function sendPaymentFailedEmail(
  input: PaymentFailedEmailInput,
): Promise<SendEmailResult> {
  const redis = getRedisClient();
  const cooldownKey = `dunning-sent:${input.userId}`;

  if (redis) {
    try {
      const existing = await redis.get(cooldownKey);
      if (existing) {
        logger.info('Dunning email suppressed — inside 24h cooldown', {
          userId: input.userId,
        });
        return { sent: false, reason: 'error', error: 'cooldown-active' };
      }
    } catch (err) {
      logger.warn('Redis cooldown read failed; proceeding with send', {
        userId: input.userId,
        error:  err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = await sendEmail({
    to:       input.email,
    subject:  SUBJECT,
    text:     renderBody(input.name, input.priorTier),
    template: TEMPLATE_TAG,
  });

  if (result.sent && redis) {
    try {
      await redis.set(cooldownKey, '1', { ex: DUNNING_COOLDOWN_SECONDS });
    } catch (err) {
      logger.warn('Redis cooldown write failed', {
        userId: input.userId,
        error:  err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
