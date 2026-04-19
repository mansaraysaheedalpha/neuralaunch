// src/auth.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";
import { logger } from "./lib/logger";
import { env } from "@/lib/env";
import { readTierCache } from "@/lib/auth/tier-cache";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      // allowDangerousEmailAccountLinking is named "Dangerous" by
      // Auth.js because it allows account-takeover via email collision
      // when an OAuth provider does not strictly verify email
      // ownership. Both Google and GitHub DO verify email ownership
      // (you cannot create an account with an email you do not
      // control), so this is acceptable for our threat model — but
      // we should never enable it for any provider that ships
      // unverified emails.
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
    signIn() {
      // Allow sign in - account linking will be handled automatically
      // by allowDangerousEmailAccountLinking
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
