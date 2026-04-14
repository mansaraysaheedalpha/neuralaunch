// src/lib/push/send-push.ts
//
// Expo push sender. Talks directly to Expo's push service so we don't
// have to touch APNs or FCM ourselves. Sends are best-effort — a
// failed push never blocks the caller (the nudge cron, the check-in
// route, etc.); we just log and move on.
//
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

import 'server-only';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  /** Expo push token(s) — accepts a single token or an array. */
  to:       string | string[];
  title:    string;
  body:     string;
  /** Optional data payload — the mobile app reads this from the tap handler. */
  data?:    Record<string, unknown>;
  /** iOS sound. Default 'default' (system sound). */
  sound?:   'default' | null;
  /** iOS badge count (absolute, not delta). */
  badge?:   number;
}

/**
 * Fire one or more push notifications. Accepts a single PushMessage
 * or an array; Expo lets us batch up to 100 in a single call so we
 * pass arrays through when we have them.
 *
 * Never throws. Logs failures and returns null on error.
 */
export async function sendPush(messages: PushMessage | PushMessage[]): Promise<unknown> {
  const payload = Array.isArray(messages) ? messages : [messages];
  if (payload.length === 0) return null;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept':           'application/json',
        'Accept-encoding':  'gzip, deflate',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.warn('[Push] Expo push request failed', {
        status:      res.status,
        messageCount: payload.length,
      });
      return null;
    }

    const json: unknown = await res.json().catch(() => null);
    return json;
  } catch (err) {
    logger.warn('[Push] Expo push request threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Send a push notification to every active device a user has
 * registered, respecting their `nudgesEnabled` preference.
 *
 * Returns the number of devices sent to (0 if user opted out or has
 * no tokens — also the error path, which is intentional since we do
 * not want the caller distinguishing).
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<number> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      nudgesEnabled: true,
      pushTokens: { select: { token: true } },
    },
  });

  if (!user) return 0;
  if (!user.nudgesEnabled) return 0;
  if (user.pushTokens.length === 0) return 0;

  const tokens = user.pushTokens.map(t => t.token);

  await sendPush(tokens.map(to => ({
    to,
    title,
    body,
    data,
    sound: 'default' as const,
  })));

  // Touch lastUsedAt — useful for future pruning of stale tokens
  await prisma.pushToken.updateMany({
    where: { token: { in: tokens } },
    data:  { lastUsedAt: new Date() },
  }).catch(() => { /* best-effort */ });

  return tokens.length;
}
