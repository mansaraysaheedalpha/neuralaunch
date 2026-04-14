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
import { randomBytes } from 'crypto';
import prisma from '@/lib/prisma';
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
export async function resolveUserFromToken(
  token: string,
): Promise<{ id: string; name: string | null; email: string | null; image: string | null } | null> {
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

    return session.user;
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
