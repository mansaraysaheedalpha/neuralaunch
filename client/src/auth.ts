// src/auth.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import LinkedIn from "next-auth/providers/linkedin";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";
import { logger } from "./lib/logger";
import { env } from "@/lib/env";
import { readTierCache } from "@/lib/auth/tier-cache";

/**
 * GitHub primary-email verification gate.
 *
 * GitHub's `/user` profile endpoint returns the user's primary email as
 * a plain string with NO verification flag. A GitHub user can register
 * and use any email address as their primary without ever proving they
 * own it. Combined with `allowDangerousEmailAccountLinking: true`, this
 * is an account-takeover vector: an attacker creates a GitHub account
 * with a victim's email (unverified), authorises the OAuth app, and
 * Auth.js silently links the GitHub identity into the victim's
 * existing NeuraLaunch account.
 *
 * Mitigation: every GitHub sign-in fetches `/user/emails` (which is
 * gated by the `user:email` scope we already request) and refuses to
 * proceed unless the OAuth-supplied email matches a row marked
 * `verified: true` AND `primary: true`. Fail-closed on any error from
 * the API, missing token, or shape mismatch — never allow a sign-in
 * we cannot positively confirm.
 *
 * Google has its own verification at the issuer (`email_verified` in
 * the ID token) which Auth.js + the Google provider already enforce by
 * default; this gate is GitHub-specific.
 */
async function verifyGitHubPrimaryEmail(
  accessToken: string,
  expectedEmail: string,
): Promise<boolean> {
  try {
    const res = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept:        'application/vnd.github+json',
        // GitHub asks every API caller to identify itself; without a
        // User-Agent header the request is rejected with 403.
        'User-Agent':  'neuralaunch-auth-verify',
      },
    });
    if (!res.ok) {
      logger.warn('GitHub /user/emails fetch failed during sign-in verification', {
        status: res.status,
      });
      return false;
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body)) {
      logger.warn('GitHub /user/emails returned non-array body');
      return false;
    }
    const expectedLower = expectedEmail.toLowerCase();
    for (const entry of body) {
      if (
        entry
        && typeof entry === 'object'
        && 'email' in entry
        && 'verified' in entry
        && 'primary' in entry
        && typeof (entry as { email: unknown }).email === 'string'
        && (entry as { verified: unknown }).verified === true
        && (entry as { primary: unknown }).primary === true
        && (entry as { email: string }).email.toLowerCase() === expectedLower
      ) {
        return true;
      }
    }
    return false;
  } catch (err) {
    logger.warn('GitHub /user/emails fetch threw during sign-in verification', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// LinkedIn OAuth uses OpenID Connect; the issuer-side `email_verified`
// claim makes auto-linking safe (same security model as Google) so we
// keep allowDangerousEmailAccountLinking enabled and rely on LinkedIn's
// own verification — no GitHub-style /user/emails round-trip needed.
// The provider is always registered (no conditional spread) — if env
// vars are missing in a particular deploy, NextAuth surfaces a real
// "missing client_id" error on the OAuth handshake which is far easier
// to debug than the prior "button silently absent" failure mode.
// Empty-string fallbacks keep the constructor signature satisfied
// without crashing app boot when the vars are unset; the actual
// signin attempt is what surfaces the misconfiguration.

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    LinkedIn({
      clientId:     env.LINKEDIN_CLIENT_ID     ?? '',
      clientSecret: env.LINKEDIN_CLIENT_SECRET ?? '',
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      // allowDangerousEmailAccountLinking is named "Dangerous" by
      // Auth.js because it allows account-takeover via email collision
      // when an OAuth provider does not strictly verify email
      // ownership. Google verifies email ownership at the issuer
      // (email_verified claim in the ID token, enforced by the Google
      // provider). GitHub does NOT — its /user profile endpoint returns
      // the primary email as a plain string with no verification flag,
      // so an attacker can register a GitHub account with a victim's
      // email and link into the victim's NeuraLaunch account.
      //
      // We keep auto-linking enabled for UX (one identity, multiple
      // OAuth providers) but pair it with verifyGitHubPrimaryEmail()
      // in the signIn callback below — every GitHub sign-in fetches
      // /user/emails (gated by user:email scope) and rejects unless
      // the OAuth-supplied email matches a row marked verified=true
      // AND primary=true.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          // Minimum-privilege scope: just the user's public profile
          // and primary email. The previous scope was 'repo workflow'
          // which granted full read/write to all of the user's public
          // AND private repos plus GitHub Actions workflows — a
          // legacy permission from the deleted Phase 2 deploy-to-
          // GitHub feature. The current product makes ZERO GitHub
          // API calls; the only place a GitHub-linked account is
          // referenced is the profile page (provider name + id),
          // which works fine with read:user.
          scope: "read:user user:email",
        },
      },
    }),
  ],
  secret: env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      // GitHub-specific account-takeover defence. The provider's auto-
      // linking is allowed only after the OAuth-supplied email is
      // proven to be a verified+primary email on the GitHub side.
      // Fail-closed: any missing token, shape mismatch, or fetch
      // failure rejects the sign-in. See verifyGitHubPrimaryEmail().
      if (account?.provider === 'github') {
        const accessToken = account.access_token;
        const claimedEmail = user?.email;
        if (typeof accessToken !== 'string' || accessToken.length === 0) {
          logger.warn('GitHub sign-in rejected: no access_token on account');
          return false;
        }
        if (typeof claimedEmail !== 'string' || claimedEmail.length === 0) {
          logger.warn('GitHub sign-in rejected: no email on user object');
          return false;
        }
        const ok = await verifyGitHubPrimaryEmail(accessToken, claimedEmail);
        if (!ok) {
          logger.warn('GitHub sign-in rejected: email is not a verified primary on GitHub', {
            // No email logged — CLAUDE.md PII rule.
            providerAccountId: account.providerAccountId,
          });
          return false;
        }
      }
      return true;
    },
    async session({ session, user }) {
      if (!session.user) return session;
      session.user.id = user.id;

      // Billing tier is embedded in the session so API routes can gate
      // on session.user.tier without a second database round trip per
      // request. We were previously running findUnique on EVERY
      // session() call, which fires on every authenticated request
      // (page render, server action, API route via auth()). On a busy
      // session this was 60+ identical Subscription queries per minute
      // per user — the first thing to bottleneck under scale.
      //
      // Now: cache the (tier, status) pair in-process for 30s per user.
      // Invalidate immediately when User.tierUpdatedAt advances past
      // the cache entry's snapshot — so a webhook-driven tier change
      // propagates to the user's next navigation without waiting for
      // the 30s window to elapse. The webhook processor bumps
      // tierUpdatedAt inside the same transaction that mutates tier,
      // so reading it here is consistent with the tier mutation.
      //
      // The 30s TTL is short enough that even a missed invalidation
      // (e.g. edge-cached User row) self-heals in seconds. Authoritative
      // source remains the Subscription row; this is purely a hot-path
      // cache.
      const cached = await readTierCache(user.id);
      session.user.tier               = cached.tier;
      session.user.subscriptionStatus = cached.status;
      session.user.lastPaidTier       = cached.lastPaidTier;
      session.user.wasFoundingMember  = cached.wasFoundingMember;
      return session;
    },
  },
  events: {
    // CLAUDE.md security rule: never log PII (including email) at
    // info level. The audit trail just needs userId — that is
    // enough to correlate events server-side without writing PII
    // into Vercel's log retention.
    createUser: ({ user }) => {
      logger.info('New user created', { userId: user.id });
    },
    signIn: ({ user, account, isNewUser }) => {
      logger.info('User signed in', {
        userId:   user.id,
        provider: account?.provider ?? 'unknown',
        isNewUser,
      });
    },
    linkAccount: ({ user, account }) => {
      logger.info('Account linked', {
        userId:   user.id,
        provider: account.provider,
      });
    },
  },
  pages: {
    signIn: "/signin",
    error: "/signin", // Redirect errors to signin page
  },
});
