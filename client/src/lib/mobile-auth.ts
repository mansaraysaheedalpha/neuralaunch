// src/lib/mobile-auth.ts
//
// Mobile authentication helpers. The web app uses NextAuth's cookie-based
// sessions. The mobile app can't use cookies — it sends a Bearer token
// in the Authorization header. This module bridges the two by:
//
// 1. Creating Session rows the same way NextAuth does (same table,
//    same shape) so the Prisma adapter stays happy
// 2. Resolving sessions from Bearer tokens using the same Session table
// 3. Generating cryptographically random session tokens
//
// IMPORTANT: This module does NOT bypass NextAuth's security model.
// The Session table is the single source of truth for both web and
// mobile sessions. The only difference is the transport: cookie vs
// Authorization header.

import 'server-only';
import { randomBytes, createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// Session token: 32 bytes of crypto randomness, base64url encoded.
// Same entropy as NextAuth's own token generation.
const TOKEN_BYTES = 32;

// Mobile sessions expire after 30 days. Longer than the web default
// (which varies by provider) because mobile users expect to stay
// signed in. The token is stored in expo-secure-store (hardware-backed
// keychain on iOS, encrypted shared prefs on Android).
const SESSION_EXPIRY_DAYS = 30;

/**
 * Generate a cryptographically random session token.
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Create a new Session row for a mobile user. Returns the raw
 * sessionToken that the mobile app stores in SecureStore.
 */
export async function createMobileSession(userId: string): Promise<string> {
  const sessionToken = generateSessionToken();
  const expires = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expires,
    },
  });

  logger.info('Mobile session created', { userId });
  return sessionToken;
}

/**
 * Resolve a user from a Bearer token. Checks the Session table,
 * verifies expiry, and returns the user if valid.
 *
 * Returns null if the token is invalid, expired, or the user
 * doesn't exist. Never throws — callers check the return value.
 */
/**
 * Shape returned to mobile clients. Tier is derived from the
 * Subscription row — free when no subscription exists. The mobile
 * app uses tier to gate features and to select the right pushback
 * round cap per tier.
 */
export interface MobileUser {
  id:    string;
  name:  string | null;
  email: string | null;
  image: string | null;
  tier:  string;              // 'free' | 'execute' | 'compound'
  isFoundingMember: boolean;
}

export async function resolveUserFromToken(
  token: string,
): Promise<MobileUser | null> {
  if (!token || token.length < 10) return null;

  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      select: {
        expires: true,
        user: {
          select: {
            id:    true,
            name:  true,
            email: true,
            image: true,
            subscription: {
              select: {
                tier:             true,
                isFoundingMember: true,
              },
            },
          },
        },
      },
    });

    if (!session) return null;

    // Check expiry
    if (session.expires < new Date()) {
      // Expired — clean up the row
      await prisma.session.delete({
        where: { sessionToken: token },
      }).catch(() => { /* best-effort cleanup */ });
      return null;
    }

    const { subscription, ...user } = session.user;
    return {
      ...user,
      tier:             subscription?.tier ?? 'free',
      isFoundingMember: subscription?.isFoundingMember ?? false,
    };
  } catch {
    return null;
  }
}

/**
 * Extract a Bearer token from the Authorization header.
 * Returns null if the header is missing or malformed.
 */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth) return null;
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

// ---------------------------------------------------------------------------
// OAuth state signing — carries the mobile redirect URI through the OAuth
// dance with an HMAC so a malicious actor can't inject their own redirect.
//
// These live here (not inside the route.ts files) because Next.js 15's
// App Router forbids non-handler exports from route.ts files.
// ---------------------------------------------------------------------------

export function signState(redirectUri: string): string {
  const nonce = randomBytes(16).toString('hex');
  const payload = `${nonce}:${redirectUri}`;
  const signature = createHash('sha256')
    .update(`${env.NEXTAUTH_SECRET}:${payload}`)
    .digest('hex')
    .slice(0, 16);
  // base64url so it's URL-safe
  return Buffer.from(`${signature}:${payload}`).toString('base64url');
}

export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString();
    const [signature, ...rest] = decoded.split(':');
    const payload = rest.join(':');
    const [, ...uriParts] = payload.split(':');
    const redirectUri = uriParts.join(':');

    const expected = createHash('sha256')
      .update(`${env.NEXTAUTH_SECRET}:${payload}`)
      .digest('hex')
      .slice(0, 16);

    if (signature !== expected) return null;
    return redirectUri;
  } catch {
    return null;
  }
}
