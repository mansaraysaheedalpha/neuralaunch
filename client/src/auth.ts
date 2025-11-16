// src/auth.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";
import { logger } from "./lib/logger";
import { trackEvent } from "@/lib/analytics";
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
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: "repo workflow",
        },
      },
    }),

    // --- VERCEL OAUTH PROVIDER REMOVED ---
  ],
  secret: env.NEXTAUTH_SECRET,
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    createUser: ({ user }) => {
      logger.info(`New user created: ${user.id}, Email: ${user.email}`);
      trackEvent("sign_up", { userId: user.id });
    },
    signIn: ({ user, account, isNewUser }) => {
      logger.info(
        `User signed in: ${user.id}, Provider: ${account?.provider ?? "unknown"}, New User: ${isNewUser}`
      );
    },
    linkAccount: ({ user, account }) => {
      logger.info(`Linked ${account.provider} account for user ${user.id}.`);
    },
  },
  pages: {
    signIn: "/signin",
    error: "/auth/error", // A custom error page
  },
});
