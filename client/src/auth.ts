// src/auth.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";
import type { OAuthConfig } from "next-auth/providers";
import { logger } from "./lib/logger"; // Keep logger

interface VercelProfile {
  uid: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  avatar?: string | null;
}
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
    }),
    {
      id: "vercel",
      name: "Vercel",
      type: "oauth",
      clientId: env.VERCEL_CLIENT_ID,
      clientSecret: env.VERCEL_CLIENT_SECRET,
      authorization: {
        url: "https://vercel.com/oauth/authorize",
        params: {
          // *** REMOVED "offline_access" as per your research ***
          scope: "projects:read-write deployments:read-write teams:read",
        },
      },
      token: "https://api.vercel.com/v2/oauth/access_token",
      userinfo: {
        url: "https://api.vercel.com/v2/user",
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const response = await fetch("https://api.vercel.com/v2/user", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (!response.ok) {
            const errorData: unknown = await response.json().catch(() => ({}));
            logger.error(
              `Vercel userinfo request failed: ${JSON.stringify(errorData)}`
            );
            throw new Error("Failed to fetch Vercel user info.");
          }
          // The response has a 'user' property
          const data = (await response.json()) as {
            user: VercelProfile;
          };
          return data.user;
        },
      },
      profile(profile: VercelProfile) {
        return {
          id: profile.uid, // Map 'uid' to 'id'
          name: profile.name || profile.username || null,
          email: profile.email,
          image: profile.avatar,
        };
      },
    } as OAuthConfig<VercelProfile>,
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
    // Keep events simple
    createUser: ({ user }) => {
      logger.info(`New user created: ${user.id}, Email: ${user.email}`);
      trackEvent("sign_up", { userId: user.id });
    },
    signIn: ({ user, account, isNewUser }) => {
      logger.info(
        `User signed in: ${user.id}, Provider: ${account?.provider ?? "unknown"}, New User: ${isNewUser}`
      );
    },
    // *** REMOVED THE linkAccount LOGIC ***
    linkAccount: ({ user, account }) => {
      logger.info(`Linked ${account.provider} account for user ${user.id}.`);
    },
  },
  pages: {
    signIn: "/signin",
  },
});
