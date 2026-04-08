// src/auth.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";
import { logger } from "./lib/logger";
import { env } from "@/lib/env";

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
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
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
