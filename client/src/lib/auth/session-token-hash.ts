// src/lib/auth/session-token-hash.ts
//
// At-rest protection for session tokens. The Session table previously
// stored raw tokens — a read-only DB leak (compromised replica,
// accidental backup exposure, prisma:query log) would have handed the
// attacker every active session for up to 30 days. Now the table
// stores ONLY hashes; clients (browser cookie, mobile SecureStore)
// hold the raw token; lookup re-hashes the incoming token and queries
// by the hash.
//
// HMAC vs plain SHA-256:
//   Plain hash is sufficient for strong tokens (32 bytes of randomness
//   is uniformly distributed and not enumerable) — the attacker can't
//   reverse a leaked hash. HMAC adds defence-in-depth: an attacker who
//   later obtains a SEPARATE leak of known historical raw tokens
//   cannot precompute their hashes without also having the HMAC key.
//   Also opens the door to key rotation: changing NEXTAUTH_SECRET
//   invalidates every stored hash in one move (acts as an emergency
//   global session reset). Cost is one extra Buffer construction per
//   call — negligible compared to the Postgres lookup that follows.
//
// Hex output: matches the @unique String column shape; lookup is a
// pure equality check, no constant-time concerns at the DB layer.

import 'server-only';
import { createHmac } from 'crypto';
import { env } from '@/lib/env';

/**
 * Hash a session token with HMAC-SHA-256, keyed on NEXTAUTH_SECRET.
 *
 * Used in two contexts that share the same Session table:
 *   - NextAuth's PrismaAdapter (web cookie sessions) via the wrapper
 *     in src/auth.ts.
 *   - Mobile bearer-token flows in src/lib/mobile-auth.ts.
 *
 * Both write the hash to Session.sessionToken and look up by re-hashing
 * the client-supplied raw token. The DB never sees the raw value.
 */
export function hashSessionToken(rawToken: string): string {
  return createHmac('sha256', env.NEXTAUTH_SECRET)
    .update(rawToken)
    .digest('hex');
}
