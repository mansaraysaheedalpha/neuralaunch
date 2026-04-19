// src/lib/email/sender.ts
//
// Thin transactional email wrapper. Uses Resend when
// RESEND_API_KEY + RESEND_FROM_EMAIL are set; becomes a graceful
// no-op (logging only) when either is missing. Designed so the
// absence of email configuration never blocks webhook processing
// or application boot — the only cost of an un-configured deployment
// is that the dunning email doesn't go out. UI banners and mobile
// push still fire.
//
// Resend is a declared dependency — user needs to run
// `pnpm install` to fetch it when first pulling this branch.

import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface SendEmailInput {
  to:      string;
  subject: string;
  /** Plain-text body. No HTML template engine in the stack. */
  text:    string;
  /**
   * Observability tag — opaque string attached to the log line on
   * send. Lets the operator grep by template type in Sentry.
   */
  template: string;
}

export interface SendEmailResult {
  /** True when the transport actually dispatched the email. */
  sent:   boolean;
  reason: 'sent' | 'no-transport' | 'no-from-address' | 'error';
  error?: string;
}

/**
 * Send a transactional email via Resend, or log a no-op when the
 * transport isn't configured. Swallows transport errors (returns
 * `sent: false`) so the caller can fire-and-forget without wrapping
 * in try/catch at every site.
 *
 * Callers that care about delivery should inspect the returned
 * `sent` flag; callers that use email as a supplemental nudge
 * alongside another channel (push notification, in-app banner) can
 * ignore the result.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  const fromAddress = env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    logger.info('Email skipped — RESEND_API_KEY not configured', {
      template: input.template,
      to:       redactEmail(input.to),
    });
    return { sent: false, reason: 'no-transport' };
  }
  if (!fromAddress) {
    logger.warn('Email skipped — RESEND_FROM_EMAIL not configured', {
      template: input.template,
    });
    return { sent: false, reason: 'no-from-address' };
  }

  try {
    const client = new Resend(apiKey);
    const result = await client.emails.send({
      from:    fromAddress,
      to:      input.to,
      subject: input.subject,
      text:    input.text,
    });

    if (result.error) {
      const errMsg = result.error.message ?? String(result.error);
      logger.error(
        'Resend send failed',
        new Error(errMsg),
        { template: input.template, to: redactEmail(input.to) },
      );
      return { sent: false, reason: 'error', error: errMsg };
    }

    logger.info('Email sent via Resend', {
      template:  input.template,
      to:        redactEmail(input.to),
      messageId: result.data?.id,
    });
    return { sent: true, reason: 'sent' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      'Email send threw',
      err instanceof Error ? err : new Error(msg),
      { template: input.template, to: redactEmail(input.to) },
    );
    return { sent: false, reason: 'error', error: msg };
  }
}

/**
 * Reduce an email address to a loggable form. Keeps the domain and
 * first-character of the local part, redacts the rest — enough to
 * correlate incidents without storing PII verbatim in logs.
 */
function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.charAt(0)}***@${domain}`;
}
