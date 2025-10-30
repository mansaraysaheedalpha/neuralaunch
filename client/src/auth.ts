// src/auth.ts

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma"; // Your Prisma singleton
import type { Adapter } from "next-auth/adapters";
import type { OAuthConfig } from "next-auth/providers";
import { logger } from "./lib/logger";
import { trackEvent } from "@/lib/analytics"; // Your analytics function
import { getVercelTeamId } from "./lib/vercel";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true, // Allow linking accounts with same verified email
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true, // Allow linking accounts with same verified email
      authorization: {
        params: {
          // Request permissions needed for repo creation/management
          scope: "repo workflow",
        },
      },
    }),
    // --- CORRECTED VERCEL PROVIDER ---
    {
      id: "vercel", // Unique ID for this provider
      name: "Vercel",
      type: "oauth",
      clientId: process.env.VERCEL_CLIENT_ID!,
      clientSecret: process.env.VERCEL_CLIENT_SECRET!,
      authorization: {
        url: "https://vercel.com/oauth/authorize", // Vercel's Auth URL
        params: {
          scope:
            "offline_access projects:read-write deployments:read-write teams:read",
        },
      },
      token: "https://api.vercel.com/v2/oauth/access_token", // Vercel's Token URL
      userinfo: {
        // Endpoint to fetch basic user info after auth
        url: "https://api.vercel.com/v2/user",
        async request({ tokens }: { tokens: { access_token?: string } }) {
          // context contains tokens, provider config
          const response = await fetch("https://api.vercel.com/v2/user", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const data = (await response.json()) as {
            user: {
              uid: string;
              name?: string | null;
              username?: string | null;
              email?: string | null;
              avatar?: string | null;
            };
          };
          if (!response.ok) {
            console.error("Vercel userinfo request failed:", data);
            throw new Error("Failed to fetch Vercel user info.");
          }
          return data.user; // Return the user object part of the response
        },
      },
      profile(profile: {
        uid: string;
        name?: string | null;
        username?: string | null;
        email?: string | null;
        avatar?: string | null;
      }) {
        // Map Vercel user data to standard NextAuth user fields
        return {
          id: profile.uid,
          name: profile.name || profile.username || null,
          email: profile.email,
          image: profile.avatar, // Vercel uses 'avatar' field
        };
      },
    } as OAuthConfig<{
      uid: string;
      name?: string | null;
      username?: string | null;
      email?: string | null;
      avatar?: string | null;
    }>,
  ],
  secret: process.env.NEXTAUTH_SECRET!, // Ensure this is set
  callbacks: {
    // Add the userId to the session object
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
    // The Prisma adapter automatically handles storing OAuth tokens (access_token, etc.)
    // in the `Account` table upon successful sign-in or account linking.
  },
  events: {
    createUser: ({ user }) => {
      console.log(`New user created: ${user.id}, Email: ${user.email}`);
      trackEvent("sign_up", { userId: user.id });
    },
    signIn: ({ user, account, isNewUser }) => {
      console.log(
        `User signed in: ${user.id}, Provider: ${account?.provider ?? "unknown"}, New User: ${isNewUser}`
      );
      // trackEvent("sign_in", { userId: user.id, provider: account?.provider, isNewUser });
    },
    // --- MODIFIED linkAccount EVENT ---
    linkAccount: async ({ user, account }) => {
      logger.info(
        `Linked ${account.provider} account for user ${user.id}. Adapter stored tokens.`
      );

      // ** Check if the linked account is Vercel **
      if (account.provider === "vercel" && account.access_token) {
        logger.info(
          `Vercel account linked for user ${user.id}. Fetching Team ID...`
        );

        // Fetch the Vercel Team ID using the newly obtained access token
        const teamId = await getVercelTeamId(account.access_token);

        if (teamId) {
          try {
            // Store the fetched teamId on the User model in Prisma
            await prisma.user.update({
              where: { id: user.id },
              data: { vercelTeamId: teamId }, // ASSUMES `vercelTeamId String?` field exists on User
            });
            logger.info(`Stored Vercel Team ID ${teamId} for user ${user.id}.`);
          } catch (dbError) {
            logger.error(
              `Failed to update user ${user.id} with Vercel Team ID ${teamId}:`,
              dbError instanceof Error ? dbError : undefined
            );
            // Non-critical error, logging is sufficient for now.
            // The deploy route can potentially fetch it later if needed.
          }
        } else {
          logger.info(
            `No Vercel Team ID found or fetched for user ${user.id}. User might be using personal account.`
          );
          // Optionally ensure the field is null if no team found
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { vercelTeamId: null }, // Explicitly set to null if no team
            });
          } catch (dbError) {
            logger.error(
              `Failed to clear Vercel Team ID for user ${user.id}:`,
              dbError instanceof Error ? dbError : undefined
            );
          }
        }
      }
    },
  },
  // If you need custom sign-in pages, define them here:
  pages: {
    signIn: "/signin",
  },
});
